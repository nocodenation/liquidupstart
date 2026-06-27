from __future__ import annotations

import logging
from collections import Counter
from typing import Any

from privacy_gateway.core.metrics import Metrics
from privacy_gateway.core.restore import restore_json, restore_text

logger = logging.getLogger(__name__)


class Session:
    def __init__(self, gateway: "Gateway", conversation_id: str, session_id: str = ""):
        self.gateway = gateway
        self.conversation_id = conversation_id
        self.session_id = session_id
        self.prompt_corpus = ""

    def anonymize_text(self, text: str) -> str:
        if not text:
            return text
        spans = self.gateway.detector.detect(text)
        if not spans:
            return text
        result = text
        for span in sorted(spans, key=lambda s: s.start, reverse=True):
            original = text[span.start : span.end]
            entry = self.gateway.vault.mint(
                span.entity_type,
                original,
                self.conversation_id,
                self.session_id,
                self.prompt_corpus,
            )
            result = result[: span.start] + entry.replacement + result[span.end :]
        logger.debug(
            "anonymize conv=%s field_len=%d spans=%d types=%s lang=%s",
            self.conversation_id[:8],
            len(text),
            len(spans),
            dict(Counter(s.entity_type for s in spans)),
            spans[0].language,
        )
        return result

    def reverse_map(self) -> dict[str, str]:
        return self.gateway.vault.reverse_map(self.conversation_id)

    def restore_text(self, text: str) -> str:
        return restore_text(text, self.reverse_map())

    def restore_json(self, obj: Any) -> Any:
        return restore_json(obj, self.reverse_map())


class Gateway:
    def __init__(self, detector, vault):
        self.detector = detector
        self.vault = vault

    def new_session(self, conversation_id: str, session_id: str = "") -> Session:
        return Session(self, conversation_id, session_id)

    def metrics(self) -> Metrics:
        return self.vault.metrics()
