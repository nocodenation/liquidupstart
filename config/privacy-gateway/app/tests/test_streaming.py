from __future__ import annotations

import json

from fastapi.testclient import TestClient

from privacy_gateway.core.streaming.sse import SSEFramer


SAMPLE = (
    b"event: message_start\n"
    b'data: {"type":"message_start"}\n'
    b"\n"
    b"event: content_block_start\n"
    b'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n'
    b"\n"
    b"event: content_block_delta\n"
    b'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"hi"}}\n'
    b"\n"
    b"event: message_stop\n"
    b'data: {"type":"message_stop"}\n'
    b"\n"
)


def _drain(framer: SSEFramer, chunks) -> bytes:
    out = b""
    for c in chunks:
        for f in framer.feed(c):
            out += f.raw
    for f in framer.flush():
        out += f.raw
    return out


def test_sse_passthrough_byte_identical():
    framer = SSEFramer()
    assert _drain(framer, [SAMPLE]) == SAMPLE


def test_sse_frame_split_across_byte_chunks():
    one_byte_at_a_time = [SAMPLE[i : i + 1] for i in range(len(SAMPLE))]
    framer = SSEFramer()
    assert _drain(framer, one_byte_at_a_time) == SAMPLE

    whole = SSEFramer()
    frames = whole.feed(SAMPLE) + whole.flush()
    assert [f.event for f in frames] == [
        "message_start",
        "content_block_start",
        "content_block_delta",
        "message_stop",
    ]
    delta = json.loads(frames[2].data)
    assert delta["delta"]["text"] == "hi"


class _FakeStreamCtx:
    def __init__(self, chunks, status_code):
        self._chunks = chunks
        self.status_code = status_code

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def aiter_bytes(self):
        for c in self._chunks:
            yield c


class FakeStreamUpstream:
    def __init__(self, chunks, status_code=200):
        self._chunks = chunks
        self.status_code = status_code
        self.received = None
        self.query = None

    def stream(self, path, query, headers, json_body):
        self.received = json_body
        self.query = query
        return _FakeStreamCtx(self._chunks, self.status_code)


def test_stream_route_passthrough(make_app):
    up = FakeStreamUpstream([SAMPLE[:20], SAMPLE[20:]])
    client = TestClient(make_app(up))
    body = {
        "model": "claude-x",
        "max_tokens": 64,
        "stream": True,
        "messages": [{"role": "user", "content": "hello there"}],
    }
    r = client.post(
        "/anthropic/v1/messages?beta=true", json=body, headers={"authorization": "Bearer x"}
    )
    assert r.status_code == 200
    assert "text/event-stream" in r.headers["content-type"]
    assert r.content == SAMPLE
    assert up.query == "beta=true"
