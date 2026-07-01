from fastapi.testclient import TestClient

from privacy_gateway.api.app import create_app
from privacy_gateway.core.backstop import rescan_outbound, scan_payload
from privacy_gateway.core.gateway import Gateway
from privacy_gateway.core.vault.store import Vault

_AWS = "AKIAIOSFODNN7EXAMPLE"


def test_backstop_blocks_surviving_secret():
    spans = rescan_outbound(f"aws_key = {_AWS}", "block")
    assert spans
    assert all(s.entity_type == "SECRET" for s in spans)


def test_backstop_off_mode_allows():
    assert rescan_outbound(f"aws_key = {_AWS}", "off") == []
    assert scan_payload({"metadata": {"user_id": _AWS}}, "off") == []


class _OkUpstream:
    def __init__(self):
        self.called = False

    async def forward(self, path, query, headers, json_body):
        self.called = True

        class R:
            status_code = 200

            def json(self_inner):
                return {"content": []}

        return R()


def test_route_backstop_blocks_leaked_secret(detector):
    up = _OkUpstream()
    client = TestClient(create_app(gateway=Gateway(detector, Vault()), upstream=up))
    r = client.post(
        "/anthropic/v1/messages",
        json={
            "model": "c",
            "max_tokens": 5,
            "metadata": {"user_id": _AWS},
            "messages": [{"role": "user", "content": "hello there friend"}],
        },
    )
    assert r.status_code == 403
    assert r.json()["error"] == "secret_leak_blocked"
    assert up.called is False
