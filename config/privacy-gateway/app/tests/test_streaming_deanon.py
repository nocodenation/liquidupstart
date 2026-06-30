from __future__ import annotations

import json

from privacy_gateway.core.streaming.sse import SSEFrame, SSEFramer, serialize_frame
from privacy_gateway.core.streaming.deanon import DeanonStreamer


def _frame(event: str, data: dict) -> SSEFrame:
    return SSEFrame.parse(serialize_frame(event, json.dumps(data, ensure_ascii=False)))


def _text_block_start(idx: int) -> SSEFrame:
    return _frame(
        "content_block_start",
        {"type": "content_block_start", "index": idx,
         "content_block": {"type": "text", "text": ""}},
    )


def _text_delta(idx: int, text: str) -> SSEFrame:
    return _frame(
        "content_block_delta",
        {"type": "content_block_delta", "index": idx,
         "delta": {"type": "text_delta", "text": text}},
    )


def _block_stop(idx: int) -> SSEFrame:
    return _frame("content_block_stop", {"type": "content_block_stop", "index": idx})


def _run(reverse_map: dict[str, str], frames: list[SSEFrame]) -> str:
    streamer = DeanonStreamer(reverse_map)
    out = b""
    for f in frames:
        for chunk in streamer.process(f):
            out += chunk
    for chunk in streamer.finish():
        out += chunk

    texts: list[str] = []
    fr = SSEFramer()
    for f in fr.feed(out) + fr.flush():
        if f.data:
            d = json.loads(f.data)
            if isinstance(d, dict) and d.get("delta", {}).get("type") == "text_delta":
                texts.append(d["delta"]["text"])
    return "".join(texts)


def test_text_surrogate_split_across_deltas():
    rmap = {"Zoraida Mbeki": "Alice Johnson"}
    frames = [
        _text_block_start(0),
        _text_delta(0, "Hello Zora"),
        _text_delta(0, "ida Mbeki, welcome!"),
        _block_stop(0),
    ]
    assert _run(rmap, frames) == "Hello Alice Johnson, welcome!"


def test_text_flush_at_stream_end():
    rmap = {"Zoraida Mbeki": "Alice Johnson"}
    frames = [
        _text_block_start(0),
        _text_delta(0, "Contact "),
        _text_delta(0, "Zoraida Mbeki"),
        _block_stop(0),
    ]
    assert _run(rmap, frames) == "Contact Alice Johnson"


def test_text_alice_malice_boundary_streaming():
    rmap = {"Alice": "REALNAME"}
    frames = [
        _text_block_start(0),
        _text_delta(0, "Mal"),
        _text_delta(0, "ice and Al"),
        _text_delta(0, "ice went home."),
        _block_stop(0),
    ]
    assert _run(rmap, frames) == "Malice and REALNAME went home."


def test_text_multiple_blocks_tracked_by_index():
    rmap = {"Zoraida Mbeki": "Alice Johnson", "Faketon": "Berlin"}
    frames = [
        _text_block_start(0),
        _text_block_start(1),
        _text_delta(0, "Name: Zoraida Mbeki"),
        _text_delta(1, "City: Faketon"),
        _block_stop(0),
        _block_stop(1),
    ]
    assert _run(rmap, frames) == "Name: Alice JohnsonCity: Berlin"


def test_text_empty_reverse_map_passthrough_bytes():
    streamer = DeanonStreamer({})
    f = _text_delta(0, "nothing to restore here")
    out = b"".join(streamer.process(_text_block_start(0))) + b"".join(streamer.process(f))
    assert out == _text_block_start(0).raw + f.raw


def _tool_block_start(idx: int, name: str = "send_email") -> SSEFrame:
    return _frame(
        "content_block_start",
        {"type": "content_block_start", "index": idx,
         "content_block": {"type": "tool_use", "id": f"tu_{idx}", "name": name, "input": {}}},
    )


def _input_json_delta(idx: int, partial: str) -> SSEFrame:
    return _frame(
        "content_block_delta",
        {"type": "content_block_delta", "index": idx,
         "delta": {"type": "input_json_delta", "partial_json": partial}},
    )


def _run_tool_input(reverse_map: dict[str, str], frames: list[SSEFrame], idx: int = 0) -> dict:
    streamer = DeanonStreamer(reverse_map)
    out = b""
    for f in frames:
        for chunk in streamer.process(f):
            out += chunk
    for chunk in streamer.finish():
        out += chunk

    partial = ""
    fr = SSEFramer()
    for f in fr.feed(out) + fr.flush():
        if not f.data:
            continue
        d = json.loads(f.data)
        if (
            isinstance(d, dict)
            and d.get("index") == idx
            and d.get("delta", {}).get("type") == "input_json_delta"
        ):
            partial += d["delta"]["partial_json"]
    return json.loads(partial)


def test_tool_input_json_delta_restored():
    rmap = {"Zoraida Mbeki": "Alice Johnson"}
    frames = [
        _tool_block_start(0),
        _input_json_delta(0, '{"to": "Zora'),
        _input_json_delta(0, 'ida Mbeki", "count": 3}'),
        _block_stop(0),
    ]
    assert _run_tool_input(rmap, frames) == {"to": "Alice Johnson", "count": 3}


def test_tool_input_json_escape_safe():
    original = 'a"b\\c'
    rmap = {"Faketoken": original}
    frags = json.dumps({"note": "Faketoken", "n": 7})
    mid = len(frags) // 2
    frames = [
        _tool_block_start(0),
        _input_json_delta(0, frags[:mid]),
        _input_json_delta(0, frags[mid:]),
        _block_stop(0),
    ]
    restored = _run_tool_input(rmap, frames)
    assert restored == {"note": original, "n": 7}
