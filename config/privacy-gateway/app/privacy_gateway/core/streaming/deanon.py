from __future__ import annotations

import json

from privacy_gateway.core.restore import (
    build_buckets,
    restore_json_with_buckets,
    restore_with_buckets,
)
from privacy_gateway.core.streaming.sse import SSEFrame, serialize_frame


def _lcp(a: str, b: str) -> int:
    n = min(len(a), len(b))
    i = 0
    while i < n and a[i] == b[i]:
        i += 1
    return i


def _load(data: str | None):
    if not data:
        return None
    try:
        return json.loads(data)
    except (ValueError, TypeError):
        return None


def _text_delta_bytes(idx: int, text: str) -> bytes:
    payload = {
        "type": "content_block_delta",
        "index": idx,
        "delta": {"type": "text_delta", "text": text},
    }
    return serialize_frame("content_block_delta", json.dumps(payload, ensure_ascii=False))


def _input_json_delta_bytes(idx: int, partial: str) -> bytes:
    payload = {
        "type": "content_block_delta",
        "index": idx,
        "delta": {"type": "input_json_delta", "partial_json": partial},
    }
    return serialize_frame("content_block_delta", json.dumps(payload, ensure_ascii=False))


class DeanonStreamer:
    def __init__(self, reverse_map: dict[str, str]):
        self._buckets = build_buckets(reverse_map)
        self._active = bool(reverse_map)
        self._holdback = max((len(k) for k in reverse_map), default=0)
        self._types: dict[int, str] = {}
        self._buf: dict[int, str] = {}
        self._emitted: dict[int, int] = {}
        self._json_buf: dict[int, str] = {}

    def process(self, frame: SSEFrame) -> list[bytes]:
        if not self._active:
            return [frame.raw]
        data = _load(frame.data)
        if not isinstance(data, dict):
            return [frame.raw]
        etype = data.get("type")
        if etype == "content_block_start":
            idx = data.get("index")
            if isinstance(idx, int):
                cb = data.get("content_block") or {}
                t = cb.get("type", "")
                self._types[idx] = t
                if t == "text":
                    self._buf[idx] = ""
                    self._emitted[idx] = 0
                elif t == "tool_use":
                    self._json_buf[idx] = ""
            return [frame.raw]
        if etype == "content_block_delta":
            idx = data.get("index")
            delta = data.get("delta") or {}
            dtype = delta.get("type")
            if isinstance(idx, int) and dtype == "text_delta" and self._types.get(idx) == "text":
                self._buf[idx] += delta.get("text", "")
                return self._emit_text(idx, final=False)
            if (
                isinstance(idx, int)
                and dtype == "input_json_delta"
                and self._types.get(idx) == "tool_use"
            ):
                self._json_buf[idx] = self._json_buf.get(idx, "") + (delta.get("partial_json") or "")
                return []
            return [frame.raw]
        if etype == "content_block_stop":
            idx = data.get("index")
            out: list[bytes] = []
            if isinstance(idx, int):
                t = self._types.get(idx)
                if t == "text":
                    out += self._emit_text(idx, final=True)
                elif t == "tool_use":
                    out += self._emit_tool(idx)
            out.append(frame.raw)
            return out
        return [frame.raw]

    def finish(self) -> list[bytes]:
        out: list[bytes] = []
        for idx in list(self._buf):
            if self._types.get(idx) == "text":
                out += self._emit_text(idx, final=True)
        for idx in list(self._json_buf):
            out += self._emit_tool(idx)
        return out

    def _emit_tool(self, idx: int) -> list[bytes]:
        raw = self._json_buf.pop(idx, None)
        if not raw:
            return []
        try:
            obj = json.loads(raw)
        except ValueError:
            return [_input_json_delta_bytes(idx, raw)]
        restored = restore_json_with_buckets(obj, self._buckets)
        return [_input_json_delta_bytes(idx, json.dumps(restored, ensure_ascii=False))]

    def _emit_text(self, idx: int, final: bool) -> list[bytes]:
        buf = self._buf.get(idx, "")
        full = restore_with_buckets(buf, self._buckets)
        if final:
            stable = len(full)
        else:
            head = buf[: max(0, len(buf) - self._holdback)]
            cur = restore_with_buckets(head, self._buckets)
            stable = _lcp(cur, full)
        emitted = self._emitted.get(idx, 0)
        if stable <= emitted:
            return []
        chunk = full[emitted:stable]
        self._emitted[idx] = stable
        return [_text_delta_bytes(idx, chunk)]
