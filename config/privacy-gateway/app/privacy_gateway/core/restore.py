from __future__ import annotations

from collections import defaultdict
from typing import Any

Buckets = dict[str, list[tuple[str, str]]]


def _is_word(c: str) -> bool:
    return c.isalnum() or c == "_"


def _boundary_ok(text: str, start: int, end: int) -> bool:
    left = start == 0 or not _is_word(text[start - 1])
    right = end >= len(text) or not _is_word(text[end])
    return left and right


def build_buckets(reverse_map: dict[str, str]) -> Buckets:
    buckets: Buckets = defaultdict(list)
    for replacement, original in reverse_map.items():
        if replacement:
            buckets[replacement[0]].append((replacement, original))
    for pairs in buckets.values():
        pairs.sort(key=lambda p: len(p[0]), reverse=True)
    return buckets


def restore_with_buckets(text: str, buckets: Buckets) -> str:
    out: list[str] = []
    i = 0
    n = len(text)
    while i < n:
        bucket = buckets.get(text[i])
        match = None
        if bucket:
            for replacement, original in bucket:
                end = i + len(replacement)
                if text.startswith(replacement, i) and _boundary_ok(text, i, end):
                    match = (original, end)
                    break
        if match is None:
            out.append(text[i])
            i += 1
        else:
            original, end = match
            out.append(original)
            i = end
    return "".join(out)


def restore_text(text: str, reverse_map: dict[str, str]) -> str:
    return restore_with_buckets(text, build_buckets(reverse_map))


def restore_json(obj: Any, reverse_map: dict[str, str]) -> Any:
    return _walk(obj, build_buckets(reverse_map))


def restore_json_with_buckets(obj: Any, buckets: Buckets) -> Any:
    return _walk(obj, buckets)


def _walk(obj: Any, buckets: Buckets) -> Any:
    if isinstance(obj, str):
        return restore_with_buckets(obj, buckets)
    if isinstance(obj, dict):
        return {k: _walk(v, buckets) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_walk(v, buckets) for v in obj]
    return obj
