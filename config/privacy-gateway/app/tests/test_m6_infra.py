import ssl
import time
from threading import Thread

import httpx
import pytest
import uvicorn
from cryptography import x509
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding

from privacy_gateway.api.app import create_app
from privacy_gateway.config import Settings
from privacy_gateway.core.gateway import Gateway
from privacy_gateway.core.mitm.certs import VENDOR_HOSTS, ensure_ca
from privacy_gateway.core.vault.store import Vault

_PII = "Alice Johnson"


class EchoUpstream:
    def __init__(self):
        self.called = False

    async def forward(self, path, query, headers, json_body):
        self.called = True
        text = json_body["messages"][-1]["content"]

        class R:
            status_code = 200

            def json(self_inner):
                return {"choices": [{"message": {"role": "assistant", "content": text}}]}

        return R()


def test_ca_signs_multisan_leaf(tmp_path):
    ca = ensure_ca(tmp_path)
    ca_cert = x509.load_pem_x509_certificate(ca.ca_cert.read_bytes())
    leaf = x509.load_pem_x509_certificate(ca.leaf_cert.read_bytes())

    assert leaf.issuer == ca_cert.subject
    ca_cert.public_key().verify(
        leaf.signature,
        leaf.tbs_certificate_bytes,
        padding.PKCS1v15(),
        leaf.signature_hash_algorithm,
    )
    sans = leaf.extensions.get_extension_for_class(
        x509.SubjectAlternativeName
    ).value.get_values_for_type(x509.DNSName)
    for host in VENDOR_HOSTS:
        assert host in sans
    assert "api.x.ai" in sans


def test_ensure_ca_idempotent(tmp_path):
    first = ensure_ca(tmp_path)
    fp1 = x509.load_pem_x509_certificate(first.leaf_cert.read_bytes()).fingerprint(hashes.SHA256())
    second = ensure_ca(tmp_path)
    fp2 = x509.load_pem_x509_certificate(second.leaf_cert.read_bytes()).fingerprint(hashes.SHA256())
    assert fp1 == fp2
    assert first.ca_cert == second.ca_cert


def test_leaf_usable_in_ssl_context(tmp_path):
    ca = ensure_ca(tmp_path)
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ctx.load_cert_chain(certfile=str(ca.leaf_cert), keyfile=str(ca.leaf_key))


def _chat_body():
    return {
        "model": "grok",
        "messages": [{"role": "user", "content": f"My name is {_PII} and I like coffee."}],
    }


def test_mode_b_tls_round_trip_fake_vendor(tmp_path, detector):
    ca = ensure_ca(tmp_path)
    settings = Settings(enable_grok=True, ca_dir=str(tmp_path))
    up = EchoUpstream()
    app = create_app(settings=settings, gateway=Gateway(detector, Vault()), upstream=up)

    config = uvicorn.Config(
        app, host="127.0.0.1", port=0, log_level="warning",
        ssl_certfile=str(ca.leaf_cert), ssl_keyfile=str(ca.leaf_key),
    )
    server = uvicorn.Server(config)
    thread = Thread(target=server.run, daemon=True)
    thread.start()
    try:
        for _ in range(500):
            if server.started:
                break
            time.sleep(0.01)
        assert server.started
        port = server.servers[0].sockets[0].getsockname()[1]

        ctx = ssl.create_default_context(cafile=str(ca.ca_cert))
        ctx.check_hostname = False
        r = httpx.post(
            f"https://127.0.0.1:{port}/v1/chat/completions",
            headers={"host": "api.x.ai", "authorization": "Bearer x"},
            json=_chat_body(),
            verify=ctx,
        )
    finally:
        server.should_exit = True
        thread.join(timeout=5)

    assert r.status_code == 200
    assert up.called is True
    assert _PII in r.json()["choices"][0]["message"]["content"]


def test_mode_b_disabled_returns_404(detector):
    from fastapi.testclient import TestClient

    settings = Settings(enable_grok=False)
    up = EchoUpstream()
    app = create_app(settings=settings, gateway=Gateway(detector, Vault()), upstream=up)
    client = TestClient(app)
    r = client.post("/v1/chat/completions", json=_chat_body(), headers={"host": "api.x.ai"})
    assert r.status_code == 404
    assert up.called is False
