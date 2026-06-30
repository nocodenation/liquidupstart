from __future__ import annotations

import json

from privacy_gateway.core.restore import (
    build_buckets,
    restore_json_with_buckets,
    restore_with_buckets,
)
from privacy_gateway.core.streaming.sse import SSEFrame, serialize_frame
from privacy_gateway.core.streaming.window import stable_restored


def _load(data: str | None):
    if not data:
        return None
    try:
        return json.loads(data)
    except (ValueError, TypeError):
        return None


class ResponsesDeanonStreamer:
    def __init__(self, reverse_map: dict[str, str]):
        self._buckets = build_buckets(reverse_map)
        self._active = bool(reverse_map)
        self._holdback = max((len(k) for k in reverse_map), default=0)
        self._text_buf: dict[tuple, str] = {}
        self._text_emitted: dict[tuple, int] = {}
        self._args_buf: dict[int, str] = {}

    def process(self, frame: SSEFrame) -> list[bytes]:
        if not self._active:
            return [frame.raw]
        data = _load(frame.data)
        if not isinstance(data, dict):
            return [frame.raw]
        etype = data.get("type") or frame.event
        if etype == "response.output_text.delta":
            return self._text_delta(frame, data)
        if etype == "response.output_text.done":
            return self._text_done(frame, data)
        if etype == "response.function_call_arguments.delta":
            oi = data.get("output_index", 0)
            self._args_buf[oi] = self._args_buf.get(oi, "") + (data.get("delta") or "")
            return []
        if etype == "response.function_call_arguments.done":
            return self._args_done(frame, data)
        if etype == "response.completed":
            return self._completed(frame, data)
        if etype == "response.output_item.done":
            return self._item_done(frame, data)
        return [frame.raw]

    def finish(self) -> list[bytes]:
        return []

    def _emit(self, event: str | None, data: dict) -> bytes:
        return serialize_frame(event, json.dumps(data, ensure_ascii=False))

    def _restore_args(self, raw: str) -> str:
        if not raw:
            return raw
        try:
            obj = json.loads(raw)
        except ValueError:
            return restore_with_buckets(raw, self._buckets)
        return json.dumps(restore_json_with_buckets(obj, self._buckets), ensure_ascii=False)

    def _text_delta(self, frame: SSEFrame, data: dict) -> list[bytes]:
        key = (data.get("output_index", 0), data.get("content_index", 0))
        self._text_buf[key] = self._text_buf.get(key, "") + (data.get("delta") or "")
        full, stable = stable_restored(self._text_buf[key], self._buckets, self._holdback, False)
        emitted = self._text_emitted.get(key, 0)
        if stable <= emitted:
            return []
        self._text_emitted[key] = stable
        out = dict(data)
        out["delta"] = full[emitted:stable]
        return [self._emit(frame.event, out)]

    def _text_done(self, frame: SSEFrame, data: dict) -> list[bytes]:
        key = (data.get("output_index", 0), data.get("content_index", 0))
        full, stable = stable_restored(self._text_buf.get(key, ""), self._buckets, self._holdback, True)
        emitted = self._text_emitted.get(key, 0)
        out: list[bytes] = []
        if stable > emitted:
            self._text_emitted[key] = stable
            delta = {"type": "response.output_text.delta",
                     "output_index": data.get("output_index", 0),
                     "content_index": data.get("content_index", 0),
                     "delta": full[emitted:stable]}
            if "item_id" in data:
                delta["item_id"] = data["item_id"]
            out.append(self._emit("response.output_text.delta", delta))
        done = dict(data)
        if isinstance(data.get("text"), str):
            done["text"] = restore_with_buckets(data["text"], self._buckets)
        out.append(self._emit(frame.event, done))
        return out

    def _args_done(self, frame: SSEFrame, data: dict) -> list[bytes]:
        oi = data.get("output_index", 0)
        raw = data.get("arguments")
        if not isinstance(raw, str):
            raw = self._args_buf.get(oi, "")
        restored = self._restore_args(raw)
        self._args_buf.pop(oi, None)
        delta = {"type": "response.function_call_arguments.delta", "output_index": oi,
                 "delta": restored}
        if "item_id" in data:
            delta["item_id"] = data["item_id"]
        done = dict(data)
        done["arguments"] = restored
        return [self._emit("response.function_call_arguments.delta", delta),
                self._emit(frame.event, done)]

    def _deanon_item(self, item: dict) -> dict:
        out = dict(item)
        if out.get("type") == "message" and isinstance(out.get("content"), list):
            out["content"] = [self._deanon_part(p) for p in out["content"]]
        elif out.get("type") == "function_call" and isinstance(out.get("arguments"), str):
            out["arguments"] = self._restore_args(out["arguments"])
        return out

    def _deanon_part(self, part):
        if isinstance(part, dict) and isinstance(part.get("text"), str):
            out = dict(part)
            out["text"] = restore_with_buckets(part["text"], self._buckets)
            return out
        return part

    def _completed(self, frame: SSEFrame, data: dict) -> list[bytes]:
        out = dict(data)
        resp = out.get("response")
        if isinstance(resp, dict) and isinstance(resp.get("output"), list):
            resp = dict(resp)
            resp["output"] = [self._deanon_item(i) if isinstance(i, dict) else i
                              for i in resp["output"]]
            out["response"] = resp
        return [self._emit(frame.event, out)]

    def _item_done(self, frame: SSEFrame, data: dict) -> list[bytes]:
        out = dict(data)
        if isinstance(out.get("item"), dict):
            out["item"] = self._deanon_item(out["item"])
        return [self._emit(frame.event, out)]
