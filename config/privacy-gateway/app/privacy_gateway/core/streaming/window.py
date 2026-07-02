from __future__ import annotations

from privacy_gateway.core.restore import Buckets, restore_with_buckets


def lcp(a: str, b: str) -> int:
    n = min(len(a), len(b))
    i = 0
    while i < n and a[i] == b[i]:
        i += 1
    return i


def stable_restored(buf: str, buckets: Buckets, holdback: int, final: bool) -> tuple[str, int]:
    full = restore_with_buckets(buf, buckets)
    if final:
        return full, len(full)
    head = buf[: max(0, len(buf) - holdback)]
    cur = restore_with_buckets(head, buckets)
    return full, lcp(cur, full)
