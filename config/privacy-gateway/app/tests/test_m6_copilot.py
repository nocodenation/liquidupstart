from __future__ import annotations

import json

from fastapi.testclient import TestClient

from privacy_gateway.api.app import create_app
from privacy_gateway.config import Settings
from privacy_gateway.core.gateway import Gateway
from privacy_gateway.core.mitm.dispatch import VENDOR_MAP
from privacy_gateway.core.vault.store import Vault

_PII = "Alice Johnson"
_CONTENT = f"Refactor the module owned by {_PII} in Berlin."


class _HeaderCaptureUpstream:
    def __init__(self):
        self.headers = None
        self.json_body = None
        self.called = False

    async def forward(self, path, query, headers, json_body):
        self.called = True
        self.headers = headers
        self.json_body = json_body
        text = json_body["messages"][-1]["content"]

        class R:
            status_code = 200

            def json(self_inner):
                return {"choices": [{"message": {"role": "assistant", "content": text}}]}

        return R()


def test_vendor_map_copilot_targets_real_upstream():
    v = VENDOR_MAP["api.githubcopilot.com"]
    assert v.upstream == "https://api.githubcopilot.com"
    assert v.enable_attr == "enable_copilot"


def test_mode_b_copilot_preserves_ide_headers(detector):
    up = _HeaderCaptureUpstream()
    app = create_app(
        settings=Settings(enable_copilot=True),
        gateway=Gateway(detector, Vault()),
        upstream=up,
    )
    client = TestClient(app)
    r = client.post(
        "/chat/completions",
        json={"model": "gpt-4o", "messages": [{"role": "user", "content": _CONTENT}]},
        headers={
            "host": "api.githubcopilot.com",
            "authorization": "Bearer tid=copilot-token",
            "copilot-integration-id": "vscode-chat",
            "editor-version": "vscode/1.99.0",
        },
    )
    assert r.status_code == 200
    lowered = {k.lower(): v for k, v in up.headers.items()}
    assert lowered["authorization"] == "Bearer tid=copilot-token"
    assert lowered["copilot-integration-id"] == "vscode-chat"
    assert lowered["editor-version"] == "vscode/1.99.0"
    assert "host" not in lowered
    assert _PII not in json.dumps(up.json_body)
    assert _PII in r.json()["choices"][0]["message"]["content"]


def test_github_token_host_not_intercepted(detector):
    assert "api.github.com" not in VENDOR_MAP

    up = _HeaderCaptureUpstream()
    app = create_app(
        settings=Settings(enable_copilot=True),
        gateway=Gateway(detector, Vault()),
        upstream=up,
    )
    client = TestClient(app)
    r = client.post(
        "/copilot_internal/v2/token",
        json={"any": "payload"},
        headers={"host": "api.github.com", "authorization": "Bearer gho_x"},
    )
    assert r.status_code == 404
    assert up.called is False
