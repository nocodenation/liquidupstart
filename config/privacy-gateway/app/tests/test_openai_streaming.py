from __future__ import annotations

import json

from privacy_gateway.core.streaming.sse import SSEFrame, SSEFramer, serialize_frame
from privacy_gateway.core.streaming.openai_deanon import OpenAIDeanonStreamer


def _data_frame(chunk: dict) -> SSEFrame:
    return SSEFrame.parse(serialize_frame(None, json.dumps(chunk, ensure_ascii=False)))


def _content_delta(text: str, ci: int = 0) -> SSEFrame:
    return _data_frame({"id": "c", "object": "chat.completion.chunk",
                        "choices": [{"index": ci, "delta": {"content": text}, "finish_reason": None}]})


def _tool_delta(ci: int, ti: int, *, id=None, name=None, arguments=None) -> SSEFrame:
    tc: dict = {"index": ti}
    if id is not None:
        tc["id"] = id
        tc["type"] = "function"
    fn: dict = {}
    if name is not None:
        fn["name"] = name
    if arguments is not None:
        fn["arguments"] = arguments
    tc["function"] = fn
    return _data_frame({"id": "c", "object": "chat.completion.chunk",
                        "choices": [{"index": ci, "delta": {"tool_calls": [tc]}, "finish_reason": None}]})


def _done() -> SSEFrame:
    return SSEFrame.parse(serialize_frame(None, "[DONE]"))


def _run_raw(reverse_map: dict[str, str], frames: list[SSEFrame]) -> bytes:
    streamer = OpenAIDeanonStreamer(reverse_map)
    out = b""
    for f in frames:
        for chunk in streamer.process(f):
            out += chunk
    for chunk in streamer.finish():
        out += chunk
    return out


def _reconstruct(raw: bytes):
    content: dict[int, str] = {}
    tools: dict[tuple, dict] = {}
    fr = SSEFramer()
    for f in fr.feed(raw) + fr.flush():
        if not f.data or f.data.strip() == "[DONE]":
            continue
        chunk = json.loads(f.data)
        for choice in chunk.get("choices", []):
            ci = choice.get("index", 0)
            delta = choice.get("delta") or {}
            if isinstance(delta.get("content"), str):
                content[ci] = content.get(ci, "") + delta["content"]
            for tc in delta.get("tool_calls") or []:
                ti = tc.get("index", 0)
                e = tools.setdefault((ci, ti), {"name": None, "arguments": ""})
                fn = tc.get("function") or {}
                if fn.get("name"):
                    e["name"] = fn["name"]
                if isinstance(fn.get("arguments"), str):
                    e["arguments"] += fn["arguments"]
    return content, tools


def test_openai_stream_content_split_across_chunks():
    rmap = {"Zoraida Mbeki": "Alice Johnson"}
    frames = [_content_delta("Hello Zora"), _content_delta("ida Mbeki!"), _done()]
    content, _ = _reconstruct(_run_raw(rmap, frames))
    assert content[0] == "Hello Alice Johnson!"


def test_openai_stream_done_passthrough():
    rmap = {"Zoraida Mbeki": "Alice Johnson"}
    frames = [_content_delta("Contact Zoraida Mbeki"), _done()]
    raw = _run_raw(rmap, frames)
    assert b"data: [DONE]" in raw
    content, _ = _reconstruct(raw)
    assert content[0] == "Contact Alice Johnson"


def test_openai_stream_tool_calls_arguments_restored():
    rmap = {"Zoraida Mbeki": "Alice Johnson"}
    frames = [
        _tool_delta(0, 0, id="t1", name="send_email", arguments=""),
        _tool_delta(0, 0, arguments='{"to": "Zora'),
        _tool_delta(0, 0, arguments='ida Mbeki"}'),
        _done(),
    ]
    _, tools = _reconstruct(_run_raw(rmap, frames))
    entry = tools[(0, 0)]
    assert entry["name"] == "send_email"
    assert json.loads(entry["arguments"]) == {"to": "Alice Johnson"}


class _ByteStreamCtx:
    def __init__(self, data: bytes, status_code: int = 200):
        self._data = data
        self.status_code = status_code

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def aiter_bytes(self):
        for i in range(0, len(self._data), 9):
            yield self._data[i : i + 9]

    async def aread(self):
        return self._data


class OpenAIStreamEcho:
    def __init__(self):
        self.received = None

    def stream(self, path, query, headers, json_body):
        self.received = json_body
        user = json_body["messages"][-1]["content"]
        mid = len(user) // 2
        frames = [
            _content_delta(user[:mid]).raw,
            _content_delta(user[mid:]).raw,
            _data_frame({"choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}]}).raw,
            _done().raw,
        ]
        return _ByteStreamCtx(b"".join(frames))


def test_openai_stream_route_end_to_end(make_app):
    from fastapi.testclient import TestClient

    up = OpenAIStreamEcho()
    client = TestClient(make_app(up))
    content = "Email Alice Johnson at alice.johnson@acme.com about Berlin."
    body = {"model": "gpt-x", "stream": True,
            "messages": [{"role": "user", "content": content}]}
    r = client.post("/openai/v1/chat/completions", json=body,
                    headers={"authorization": "Bearer k"})
    assert r.status_code == 200
    assert "text/event-stream" in r.headers["content-type"]
    assert "Alice Johnson" not in json.dumps(up.received)
    got, _ = _reconstruct(r.content)
    assert got[0] == content
