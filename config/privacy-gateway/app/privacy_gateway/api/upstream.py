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

    def stream(
        self, path: str, query: str, headers: dict[str, str], json_body: dict
    ) -> "_StreamCtx":
        return _StreamCtx(self._base + path, query, headers, json_body, self._timeout)


class _StreamCtx:
    def __init__(self, url, query, headers, json_body, timeout):
        self._url = url
        self._query = query
        self._headers = headers
        self._json = json_body
        self._client = httpx.AsyncClient(timeout=timeout)
        self._cm = None

    async def __aenter__(self) -> httpx.Response:
        logger.debug("stream -> %s%s", self._url, f"?{self._query}" if self._query else "")
        self._cm = self._client.stream(
            "POST", self._url, params=self._query, headers=self._headers, json=self._json
        )
        return await self._cm.__aenter__()

    async def __aexit__(self, *exc):
        try:
            if self._cm is not None:
                await self._cm.__aexit__(*exc)
        finally:
            await self._client.aclose()
        return False
