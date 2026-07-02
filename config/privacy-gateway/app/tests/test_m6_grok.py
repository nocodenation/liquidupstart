from __future__ import annotations

import json

from fastapi.testclient import TestClient

from privacy_gateway.api.app import create_app
from privacy_gateway.config import Settings
from privacy_gateway.core.gateway import Gateway
from privacy_gateway.core.mitm.dispatch import VENDOR_MAP
from privacy_gateway.core.streaming.sse import SSEFrame, SSEFramer, serialize_frame
from privacy_gateway.core.vault.store import Vault

_PII = "Alice Johnson"
_CONTENT = f"Email {_PII} at alice.johnson@acme.com about Berlin."


def test_vendor_map_grok_targets_real_upstream():
    v = VENDOR_MAP["api.x.ai"]
    assert v.upstream == "https://api.x.ai"
    assert v.enable_attr == "enable_grok"


class _HeaderCaptureUpstream:
    def __init__(self):
        self.headers = None
        self.json_body = None

    async def forward(self, path, query, headers, json_body):
        self.headers = headers
        self.json_body = json_body
        text = json_body["messages"][-1]["content"]

        class R:
            status_code = 200

            def json(self_inner):
                return {"choices": [{"message": {"role": "assistant", "content": text}}]}

        return R()


def test_mode_b_grok_preserves_identity_headers(detector):
    up = _HeaderCaptureUpstream()
    app = create_app(
        settings=Settings(enable_grok=True),
        gateway=Gateway(detector, Vault()),
        upstream=up,
    )
    client = TestClient(app)
    r = client.post(
        "/v1/chat/completions",
        json={"model": "grok", "messages": [{"role": "user", "content": _CONTENT}]},
        headers={
            "host": "api.x.ai",
            "authorization": "Bearer sk-grok-secret",
            "x-vendor-tag": "supergrok-42",
        },
    )
    assert r.status_code == 200
    lowered = {k.lower(): v for k, v in up.headers.items()}
    assert lowered["authorization"] == "Bearer sk-grok-secret"
    assert lowered["x-vendor-tag"] == "supergrok-42"
    assert "host" not in lowered
    assert _PII not in json.dumps(up.json_body)
    assert _PII in r.json()["choices"][0]["message"]["content"]


def _data_frame(chunk: dict) -> bytes:
    return SSEFrame.parse(serialize_frame(None, json.dumps(chunk, ensure_ascii=False))).raw


def _content_delta(text: str) -> bytes:
    return _data_frame(
        {"id": "c", "object": "chat.completion.chunk",
         "choices": [{"index": 0, "delta": {"content": text}, "finish_reason": None}]}
    )


class _ByteStreamCtx:
    def __init__(self, data: bytes):
        self._data = data
        self.status_code = 200

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def aiter_bytes(self):
        for i in range(0, len(self._data), 9):
            yield self._data[i : i + 9]

    async def aread(self):
        return self._data


class _GrokStreamEcho:
    def __init__(self):
        self.received = None

    def stream(self, path, query, headers, json_body):
        self.received = json_body
        user = json_body["messages"][-1]["content"]
        mid = len(user) // 2
        done = SSEFrame.parse(serialize_frame(None, "[DONE]")).raw
        stop = _data_frame({"choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}]})
        return _ByteStreamCtx(_content_delta(user[:mid]) + _content_delta(user[mid:]) + stop + done)


def _reconstruct(raw: bytes) -> str:
    fr = SSEFramer()
    out = ""
    for f in fr.feed(raw) + fr.flush():
        if not f.data or f.data.strip() == "[DONE]":
            continue
        for choice in json.loads(f.data).get("choices", []):
            delta = choice.get("delta") or {}
            if isinstance(delta.get("content"), str):
                out += delta["content"]
    return out


def test_mode_b_grok_streaming_round_trip(detector):
    up = _GrokStreamEcho()
    app = create_app(
        settings=Settings(enable_grok=True),
        gateway=Gateway(detector, Vault()),
        upstream=up,
    )
    client = TestClient(app)
    r = client.post(
        "/v1/chat/completions",
        json={"model": "grok", "stream": True,
              "messages": [{"role": "user", "content": _CONTENT}]},
        headers={"host": "api.x.ai", "authorization": "Bearer k"},
    )
    assert r.status_code == 200
    assert "text/event-stream" in r.headers["content-type"]
    assert _PII not in json.dumps(up.received)
    assert _reconstruct(r.content) == _CONTENT
