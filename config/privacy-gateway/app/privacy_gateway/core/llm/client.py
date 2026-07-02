from __future__ import annotations

import logging
from typing import Protocol

import httpx

from privacy_gateway.core.errors import LLMUnavailable

logger = logging.getLogger(__name__)

Message = dict[str, str]


class LocalLLMClient(Protocol):
    def chat(
        self, messages: list[Message], temperature: float = 0.0, max_tokens: int = 1024
    ) -> str: ...


class OpenAICompatClient:
    def __init__(
        self,
        base_url: str,
        api_key: str = "",
        model: str = "",
        timeout: float = 60.0,
        retries: int = 1,
        transport: httpx.BaseTransport | None = None,
    ):
        self._base = base_url.rstrip("/")
        self._api_key = api_key
        self._model = model
        self._timeout = timeout
        self._retries = retries
        self._transport = transport

    def _url(self, path: str) -> str:
        if self._base.endswith("/v1"):
            return self._base + path
        return self._base + "/v1" + path

    def _headers(self) -> dict[str, str]:
        headers = {"content-type": "application/json"}
        if self._api_key:
            headers["authorization"] = f"Bearer {self._api_key}"
        return headers

    def _post(self, path: str, payload: dict) -> dict:
        last: Exception | None = None
        for attempt in range(self._retries + 1):
            try:
                with httpx.Client(
                    timeout=self._timeout, transport=self._transport
                ) as client:
                    resp = client.post(
                        self._url(path), headers=self._headers(), json=payload
                    )
                    resp.raise_for_status()
                    return resp.json()
            except httpx.HTTPError as exc:
                last = exc
                logger.warning("local-LLM request failed (attempt %d): %s", attempt + 1, exc)
        raise LLMUnavailable(str(last))

    def chat(
        self, messages: list[Message], temperature: float = 0.0, max_tokens: int = 4096
    ) -> str:
        payload = {
            "model": self._model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "chat_template_kwargs": {"enable_thinking": False},
        }
        data = self._post("/chat/completions", payload)
        msg = data["choices"][0]["message"]
        return msg.get("content") or msg.get("reasoning_content") or ""

    def models(self) -> list[str]:
        with httpx.Client(timeout=self._timeout, transport=self._transport) as client:
            resp = client.get(self._url("/models"), headers=self._headers())
            resp.raise_for_status()
            return [m["id"] for m in resp.json().get("data", [])]
