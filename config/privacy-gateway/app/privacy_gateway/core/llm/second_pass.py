from __future__ import annotations

from privacy_gateway.core.detection.language import is_short_or_structured
from privacy_gateway.core.errors import LLMUnavailable
from privacy_gateway.core.models import Span

from .client import LocalLLMClient
from .parse import extract_last_json

DEFAULT_TYPE = "QUASI_IDENTIFIER"

_SYSTEM = (
    "You are a privacy reviewer. Find sensitive or re-identifying spans in the USER "
    "text that a generic PII detector would miss (implicit/quasi-identifiers, internal "
    "names, anything that narrows identity). Reason briefly first, then output a single "
    "fenced JSON object: {\"reasoning\": str, \"spans\": [{\"text\": str, \"type\": str}]}. "
    "Every span text MUST be copied verbatim from the USER text."
)


class SecondPassDetector:
    def __init__(self, client: LocalLLMClient, temperature: float = 0.0):
        self._client = client
        self._temperature = temperature

    def detect(self, text: str) -> list[Span]:
        if is_short_or_structured(text):
            return []
        content = self._client.chat(
            [{"role": "system", "content": _SYSTEM}, {"role": "user", "content": text}],
            temperature=self._temperature,
        )
        try:
            data = extract_last_json(content)
        except ValueError as exc:
            raise LLMUnavailable(f"second-pass output unparseable: {exc}") from exc
        spans: list[Span] = []
        for item in data.get("spans", []):
            if not isinstance(item, dict):
                continue
            value = item.get("text")
            entity_type = item.get("type") or DEFAULT_TYPE
            if not isinstance(value, str) or not value:
                continue
            start = text.find(value)
            while start != -1:
                spans.append(Span(start, start + len(value), entity_type, 0.6, ""))
                start = text.find(value, start + len(value))
        return spans
