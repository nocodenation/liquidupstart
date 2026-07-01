from __future__ import annotations

import json

from fastapi.testclient import TestClient

from privacy_gateway.api.app import create_app
from privacy_gateway.config import Settings
from privacy_gateway.core.gateway import Gateway
from privacy_gateway.core.mitm.dispatch import VENDOR_MAP
from privacy_gateway.core.vault.store import Vault

_PII = "Alice Johnson"
_PATH = "/backend-api/codex/responses"


def _codex_body():
    return {
        "model": "gpt-5-codex",
        "instructions": "You are a coding assistant.",
        "input": [{"type": "message", "role": "user",
                   "content": [{"type": "input_text",
                                "text": f"I am {_PII} from Berlin, email alice@acme.com"}]}],
    }


class _ResponsesCapture:
    def __init__(self):
        self.headers = None
        self.path = None
        self.json_body = None

    def _input_text(self, body):
        out = []
        for item in body.get("input") or []:
            for p in item.get("content", []):
                if p.get("text"):
                    out.append(p["text"])
        return "".join(out)

    async def forward(self, path, query, headers, json_body):
        self.headers = headers
        self.path = path
        self.json_body = json_body
        return _R(200, {"id": "resp_1", "object": "response", "output": [
            {"type": "message", "role": "assistant",
             "content": [{"type": "output_text", "text": f"Reply: {self._input_text(json_body)}"}]}]})


class _R:
    def __init__(self, status_code, payload):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        return self._payload


def test_vendor_map_codex_uses_responses_adapter():
    from privacy_gateway.core.adapters import openai_responses
    v = VENDOR_MAP["chatgpt.com"]
    assert v.upstream == "https://chatgpt.com"
    assert v.enable_attr == "enable_codex"
    assert v.anonymize is openai_responses.anonymize_request


def _client(detector):
    up = _ResponsesCapture()
    app = create_app(
        settings=Settings(enable_codex=True),
        gateway=Gateway(detector, Vault()),
        upstream=up,
    )
    return TestClient(app), up


def test_mode_b_codex_preserves_account_headers(detector):
    client, up = _client(detector)
    r = client.post(
        _PATH,
        json=_codex_body(),
        headers={
            "host": "chatgpt.com",
            "authorization": "Bearer sess-token",
            "chatgpt-account-id": "acct-abc123",
            "originator": "codex_cli_rs",
        },
    )
    assert r.status_code == 200
    assert up.path == _PATH
    lowered = {k.lower(): v for k, v in up.headers.items()}
    assert lowered["authorization"] == "Bearer sess-token"
    assert lowered["chatgpt-account-id"] == "acct-abc123"
    assert lowered["originator"] == "codex_cli_rs"
    assert "host" not in lowered
    assert _PII not in json.dumps(up.json_body)


def test_mode_b_codex_responses_round_trip(detector):
    client, up = _client(detector)
    r = client.post(_PATH, json=_codex_body(), headers={"host": "chatgpt.com"})
    assert r.status_code == 200
    text = r.json()["output"][0]["content"][0]["text"]
    assert _PII in text
