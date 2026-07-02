from __future__ import annotations

import json

from privacy_gateway.core.restore import build_buckets, restore_json_with_buckets
from privacy_gateway.core.streaming.sse import SSEFrame, serialize_frame
from privacy_gateway.core.streaming.window import stable_restored

_ENVELOPE = ("id", "object", "created", "model", "system_fingerprint")


class OpenAIDeanonStreamer:
    def __init__(self, reverse_map: dict[str, str]):
        self._buckets = build_buckets(reverse_map)
        self._active = bool(reverse_map)
        self._holdback = max((len(k) for k in reverse_map), default=0)
        self._env: dict = {}
        self._text_buf: dict[tuple[int, str], str] = {}
        self._text_emitted: dict[tuple[int, str], int] = {}
        self._role_emitted: set[int] = set()
        self._tool_args: dict[tuple, str] = {}
        self._tool_order: list[tuple] = []
        self._tool_seen: set[tuple] = set()
        self._finish: dict[int, str] = {}
        self._usage = None

    def process(self, frame: SSEFrame) -> list[bytes]:
        if not self._active:
            return [frame.raw]
        data = frame.data
        if data is None:
            return [frame.raw]
        if data.strip() == "[DONE]":
            return self._flush() + [frame.raw]
        try:
            chunk = json.loads(data)
        except ValueError:
            return [frame.raw]
        if not isinstance(chunk, dict):
            return [frame.raw]
        if not self._env:
            self._env = {k: chunk[k] for k in _ENVELOPE if k in chunk}
        if isinstance(chunk.get("usage"), dict):
            self._usage = chunk["usage"]
        out: list[bytes] = []
        for choice in chunk.get("choices") or []:
            if not isinstance(choice, dict):
                continue
            ci = choice.get("index", 0)
            delta = choice.get("delta") or {}
            for field in ("content", "reasoning_content"):
                if isinstance(delta.get(field), str):
                    key = (ci, field)
                    self._text_buf[key] = self._text_buf.get(key, "") + delta[field]
                    out += self._emit_text(ci, field, final=False)
            for tc in delta.get("tool_calls") or []:
                out += self._handle_tool(ci, tc)
            if choice.get("finish_reason") is not None:
                self._finish[ci] = choice["finish_reason"]
        return out

    def finish(self) -> list[bytes]:
        return self._flush()

    def _chunk_bytes(self, choices: list, extra: dict | None = None) -> bytes:
        env = dict(self._env)
        env["choices"] = choices
        if extra:
            env.update(extra)
        return serialize_frame(None, json.dumps(env, ensure_ascii=False))

    def _emit_text(self, ci: int, field: str, final: bool) -> list[bytes]:
        key = (ci, field)
        buf = self._text_buf.get(key, "")
        full, stable = stable_restored(buf, self._buckets, self._holdback, final)
        emitted = self._text_emitted.get(key, 0)
        if stable <= emitted:
            return []
        text = full[emitted:stable]
        self._text_emitted[key] = stable
        delta = {field: text}
        if ci not in self._role_emitted:
            self._role_emitted.add(ci)
            delta = {"role": "assistant", **delta}
        return [self._chunk_bytes([{"index": ci, "delta": delta, "finish_reason": None}])]

    def _handle_tool(self, ci: int, tc) -> list[bytes]:
        if not isinstance(tc, dict):
            return []
        ti = tc.get("index", 0)
        key = (ci, ti)
        out: list[bytes] = []
        if key not in self._tool_seen:
            self._tool_seen.add(key)
            self._tool_order.append(key)
            self._tool_args[key] = ""
            meta: dict = {"index": ti}
            for f in ("id", "type"):
                if f in tc:
                    meta[f] = tc[f]
            fn = tc.get("function") or {}
            fmeta: dict = {}
            if "name" in fn:
                fmeta["name"] = fn["name"]
            fmeta["arguments"] = ""
            meta["function"] = fmeta
            out.append(self._chunk_bytes(
                [{"index": ci, "delta": {"tool_calls": [meta]}, "finish_reason": None}]))
        fn = tc.get("function") or {}
        if isinstance(fn.get("arguments"), str):
            self._tool_args[key] += fn["arguments"]
        return out

    def _restore_args(self, raw: str) -> str:
        if not raw:
            return ""
        try:
            obj = json.loads(raw)
        except ValueError:
            return raw
        return json.dumps(restore_json_with_buckets(obj, self._buckets), ensure_ascii=False)

    def _flush(self) -> list[bytes]:
        out: list[bytes] = []
        for ci, field in list(self._text_buf):
            out += self._emit_text(ci, field, final=True)
        for key in self._tool_order:
            ci, ti = key
            args = self._restore_args(self._tool_args.get(key, ""))
            out.append(self._chunk_bytes(
                [{"index": ci, "delta": {"tool_calls": [{"index": ti, "function": {"arguments": args}}]},
                  "finish_reason": None}]))
        self._tool_order = []
        for ci, reason in self._finish.items():
            out.append(self._chunk_bytes([{"index": ci, "delta": {}, "finish_reason": reason}]))
        self._finish = {}
        if self._usage is not None:
            out.append(self._chunk_bytes([], extra={"usage": self._usage}))
            self._usage = None
        return out
