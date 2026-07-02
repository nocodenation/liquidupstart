from __future__ import annotations

import json

from fastapi.testclient import TestClient

from privacy_gateway.core.streaming.sse import SSEFramer, serialize_frame


def _sse_text_response(text: str) -> bytes:
    mid = len(text) // 2
    frames = [
        ("message_start", {"type": "message_start", "message": {"id": "m", "content": []}}),
        ("content_block_start",
         {"type": "content_block_start", "index": 0,
          "content_block": {"type": "text", "text": ""}}),
        ("content_block_delta",
         {"type": "content_block_delta", "index": 0,
          "delta": {"type": "text_delta", "text": text[:mid]}}),
        ("content_block_delta",
         {"type": "content_block_delta", "index": 0,
          "delta": {"type": "text_delta", "text": text[mid:]}}),
        ("content_block_stop", {"type": "content_block_stop", "index": 0}),
        ("message_stop", {"type": "message_stop"}),
    ]
    return b"".join(serialize_frame(e, json.dumps(d, ensure_ascii=False)) for e, d in frames)


def _collect_stream_text(raw: bytes) -> str:
    texts: list[str] = []
    fr = SSEFramer()
    for f in fr.feed(raw) + fr.flush():
        if not f.data:
            continue
        d = json.loads(f.data)
        if isinstance(d, dict) and d.get("delta", {}).get("type") == "text_delta":
            texts.append(d["delta"]["text"])
    return "".join(texts)


class _ByteStreamCtx:
    def __init__(self, data: bytes, status_code: int = 200):
        self._data = data
        self.status_code = status_code

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def aiter_bytes(self):
        for i in range(0, len(self._data), 7):
            yield self._data[i : i + 7]

    async def aread(self):
        return self._data


class StreamEchoUpstream:
    def __init__(self):
        self.received = None

    def stream(self, path, query, headers, json_body):
        self.received = json_body
        user = json_body["messages"][0]["content"]
        return _ByteStreamCtx(_sse_text_response(user))


class _JsonResp:
    def __init__(self, status_code, payload):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        return self._payload


class JsonEchoUpstream:
    def __init__(self):
        self.received = None

    async def forward(self, path, query, headers, json_body):
        self.received = json_body
        user = json_body["messages"][0]["content"]
        return _JsonResp(200, {
            "id": "m", "type": "message", "role": "assistant",
            "content": [{"type": "text", "text": user}],
        })


class ErrUpstream:
    def stream(self, path, query, headers, json_body):
        return _ByteStreamCtx(
            b'{"type":"error","error":{"type":"invalid_request_error","message":"bad"}}',
            status_code=400,
        )


def test_stream_route_end_to_end(make_app):
    up = StreamEchoUpstream()
    client = TestClient(make_app(up))
    content = "Email Alice Johnson at alice.johnson@acme.com about Berlin."
    body = {"model": "m", "max_tokens": 64, "stream": True,
            "messages": [{"role": "user", "content": content}]}
    r = client.post("/anthropic/v1/messages?beta=true", json=body,
                    headers={"authorization": "Bearer x"})
    assert r.status_code == 200
    assert "text/event-stream" in r.headers["content-type"]
    assert "Alice Johnson" not in json.dumps(up.received)
    text = _collect_stream_text(r.content)
    assert "Alice Johnson" in text
    assert text == content


def test_stream_matches_nonstream_result(make_app):
    content = "Contact Alice Johnson in Berlin."
    base = {"model": "m", "max_tokens": 64,
            "messages": [{"role": "user", "content": content}]}

    ns = JsonEchoUpstream()
    rn = TestClient(make_app(ns)).post(
        "/anthropic/v1/messages", json=dict(base), headers={"authorization": "Bearer x"})
    n_text = rn.json()["content"][0]["text"]

    st = StreamEchoUpstream()
    rs = TestClient(make_app(st)).post(
        "/anthropic/v1/messages", json={**base, "stream": True},
        headers={"authorization": "Bearer x"})
    s_text = _collect_stream_text(rs.content)

    assert n_text == s_text == content


def test_stream_upstream_error_passthrough(make_app):
    client = TestClient(make_app(ErrUpstream()))
    body = {"model": "m", "max_tokens": 64, "stream": True,
            "messages": [{"role": "user", "content": "hi"}]}
    r = client.post("/anthropic/v1/messages", json=body,
                    headers={"authorization": "Bearer x"})
    assert r.status_code == 400
    assert r.json()["error"]["type"] == "invalid_request_error"
