from fastapi.testclient import TestClient

from privacy_gateway.api.app import create_app
from privacy_gateway.api.upstream import forward_headers
from privacy_gateway.core.gateway import Gateway
from privacy_gateway.core.vault.store import Vault
from privacy_gateway.core.vault.surrogate import SurrogateFactory


class _EmptyFaker:
    def seed_instance(self, *a, **k):
        pass

    def __getattr__(self, name):
        return lambda *a, **k: ""


class FakeResponse:
    def __init__(self, status_code, payload):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        return self._payload


class StatusUpstream:
    def __init__(self, status_code, payload):
        self.status_code = status_code
        self.payload = payload
        self.called = False

    async def forward(self, path, query, headers, json_body):
        self.called = True
        return FakeResponse(self.status_code, self.payload)


def test_forward_headers_strips_hop_by_hop_keeps_auth():
    out = forward_headers(
        {
            "Host": "gw",
            "Content-Length": "12",
            "Authorization": "Bearer k",
            "anthropic-version": "2023-06-01",
        }
    )
    lower = {k.lower() for k in out}
    assert "host" not in lower
    assert "content-length" not in lower
    assert out["Authorization"] == "Bearer k"
    assert out["anthropic-version"] == "2023-06-01"


def test_upstream_error_passthrough(detector):
    up = StatusUpstream(429, {"error": "rate_limited"})
    client = TestClient(create_app(gateway=Gateway(detector, Vault()), upstream=up))
    r = client.post(
        "/anthropic/v1/messages",
        json={"model": "c", "max_tokens": 5,
              "messages": [{"role": "user", "content": "hello there friend"}]},
    )
    assert r.status_code == 429
    assert r.json() == {"error": "rate_limited"}


def test_fail_closed_returns_400_and_does_not_forward(detector):
    failing_vault = Vault(
        SurrogateFactory(faker=_EmptyFaker(), affix_fn=lambda f: "")
    )
    up = StatusUpstream(200, {"ok": True})
    client = TestClient(create_app(gateway=Gateway(detector, failing_vault), upstream=up))
    r = client.post(
        "/anthropic/v1/messages",
        json={"model": "c", "max_tokens": 5,
              "messages": [{"role": "user",
                            "content": "My name is Alice Johnson and I live in Berlin."}]},
    )
    assert r.status_code == 400
    assert r.json() == {"error": "fail_closed"}
    assert up.called is False
