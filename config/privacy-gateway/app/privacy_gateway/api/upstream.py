from __future__ import annotations

import logging

import httpx

logger = logging.getLogger(__name__)

_SKIP_HEADERS = {"host", "content-length"}


def forward_headers(headers) -> dict[str, str]:
    return {k: v for k, v in headers.items() if k.lower() not in _SKIP_HEADERS}


class Upstream:
    def __init__(self, base_url: str, timeout: float = 120.0):
        self._base = base_url.rstrip("/")
        self._timeout = timeout

    async def forward(
        self, path: str, query: str, headers: dict[str, str], json_body: dict
    ) -> httpx.Response:
        url = self._base + path
        logger.debug("forward -> %s%s", url, f"?{query}" if query else "")
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            return await client.post(
                url, params=query, headers=headers, json=json_body
            )
