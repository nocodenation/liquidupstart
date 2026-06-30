from __future__ import annotations

from conftest import FakeLocalLLMClient
from fastapi.testclient import TestClient

from privacy_gateway.api.app import create_app
from privacy_gateway.config import Settings
from privacy_gateway.core.gateway import Gateway
from privacy_gateway.core.scoring import score_sufficiency
from privacy_gateway.core.vault.store import Vault

HIGH_RISK = (
    '```json\n{"reasoning": "role+city+relocation is near-unique", '
    '"attributes": ["VP", "Reykjavik"], "risk": 0.92, "confidence": 0.9}\n```'
)

PII_BODY = {
    "model": "claude-x",
    "max_tokens": 64,
    "messages": [{"role": "user",
                  "content": "I am Alice Johnson, the VP who relocated from our Reykjavik office."}],
}


class AnthropicEcho:
    async def forward(self, path, query, headers, json_body):
        class _R:
            status_code = 200

            def json(self_inner):
                return {"id": "m", "type": "message", "role": "assistant",
                        "content": [{"type": "text", "text": "ok"}]}

        return _R()


def _app(detector, gate_mode, client):
    settings = Settings(gate_mode=gate_mode)
    gw = Gateway(detector, Vault(), base_detector=detector, llm_client=client)
    return create_app(settings=settings, gateway=gw, upstream=AnthropicEcho())


def test_gate_block_high_risk_returns_4xx(detector):
    client = FakeLocalLLMClient(HIGH_RISK)
    c = TestClient(_app(detector, "block", client))
    r = c.post("/anthropic/v1/messages", json=PII_BODY, headers={"authorization": "Bearer x"})
    assert r.status_code == 403
    assert r.json()["error"] == "egress_blocked"


def test_gate_log_mode_adds_risk_header(detector):
    client = FakeLocalLLMClient(HIGH_RISK)
    c = TestClient(_app(detector, "log", client))
    r = c.post("/anthropic/v1/messages", json=PII_BODY, headers={"authorization": "Bearer x"})
    assert r.status_code == 200
    risk = r.headers.get("x-privacy-gateway-risk")
    assert risk is not None and risk.startswith("high")


def test_gate_off_mode_skips_scoring(detector):
    client = FakeLocalLLMClient(HIGH_RISK)
    c = TestClient(_app(detector, "off", client))
    r = c.post("/anthropic/v1/messages", json=PII_BODY, headers={"authorization": "Bearer x"})
    assert r.status_code == 200
    assert "x-privacy-gateway-risk" not in r.headers
    assert client.calls == []


def test_gate_deterministic_floor_high_without_llm(detector):
    suff = score_sufficiency(
        detector,
        "Reach me at john.doe@example.com about the budget.",
        surrogates=set(),
        client=None,
    )
    assert suff.bucket == "high"
