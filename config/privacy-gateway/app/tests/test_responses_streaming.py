from __future__ import annotations

import json

from privacy_gateway.core.streaming.sse import SSEFrame, SSEFramer, serialize_frame
from privacy_gateway.core.streaming.responses_deanon import ResponsesDeanonStreamer

RMAP = {"Zoraida Mbeki": "Alice Johnson"}


def _ev(event: str, data: dict) -> SSEFrame:
    return SSEFrame.parse(serialize_frame(event, json.dumps(data, ensure_ascii=False)))


def _run(reverse_map, frames):
    streamer = ResponsesDeanonStreamer(reverse_map)
    out = b""
    for f in frames:
        for chunk in streamer.process(f):
            out += chunk
    for chunk in streamer.finish():
        out += chunk
    parsed = []
    fr = SSEFramer()
    for f in fr.feed(out) + fr.flush():
        if f.data and f.data.strip() != "[DONE]":
            parsed.append((f.event, json.loads(f.data)))
    return parsed


def test_responses_stream_output_text_split_across_deltas():
    frames = [
        _ev("response.output_text.delta",
            {"type": "response.output_text.delta", "output_index": 0, "content_index": 0,
             "delta": "Hi Zora"}),
        _ev("response.output_text.delta",
            {"type": "response.output_text.delta", "output_index": 0, "content_index": 0,
             "delta": "ida Mbeki!"}),
        _ev("response.output_text.done",
            {"type": "response.output_text.done", "output_index": 0, "content_index": 0,
             "text": "Hi Zoraida Mbeki!"}),
    ]
    parsed = _run(RMAP, frames)
    text = "".join(d["delta"] for e, d in parsed if d.get("type") == "response.output_text.delta")
    assert text == "Hi Alice Johnson!"


def test_responses_stream_function_call_arguments_restored():
    frames = [
        _ev("response.function_call_arguments.delta",
            {"type": "response.function_call_arguments.delta", "output_index": 0, "delta": '{"to": "Zora'}),
        _ev("response.function_call_arguments.delta",
            {"type": "response.function_call_arguments.delta", "output_index": 0, "delta": 'ida Mbeki"}'}),
        _ev("response.function_call_arguments.done",
            {"type": "response.function_call_arguments.done", "output_index": 0,
             "arguments": '{"to": "Zoraida Mbeki"}'}),
    ]
    parsed = _run(RMAP, frames)
    args = "".join(
        d["delta"] for e, d in parsed
        if d.get("type") == "response.function_call_arguments.delta"
    )
    assert json.loads(args) == {"to": "Alice Johnson"}


def test_responses_stream_completed_snapshot_deanonymized():
    frames = [
        _ev("response.completed",
            {"type": "response.completed", "response": {"output": [
                {"type": "message", "role": "assistant",
                 "content": [{"type": "output_text", "text": "Hello Zoraida Mbeki"}]},
                {"type": "function_call", "call_id": "c1", "name": "send",
                 "arguments": '{"to": "Zoraida Mbeki"}'},
            ]}}),
    ]
    parsed = _run(RMAP, frames)
    completed = next(d for e, d in parsed if d.get("type") == "response.completed")
    output = completed["response"]["output"]
    assert output[0]["content"][0]["text"] == "Hello Alice Johnson"
    assert json.loads(output[1]["arguments"]) == {"to": "Alice Johnson"}
