from __future__ import annotations

from dataclasses import dataclass, field

from privacy_gateway.core.llm.client import LocalLLMClient
from privacy_gateway.core.llm.parse import extract_last_json

_SYSTEM = (
    "You rewrite the USER text to remove implicit and quasi-identifiers (a role + place + "
    "distinctive detail that together narrow identity), while preserving the task-relevant "
    "meaning. Generalize rather than delete where possible. A generalization is allowed ONLY if "
    "the original text entails it (no invented facts). Reason briefly first, then output a single "
    "fenced JSON object: {\"rewrite\": str, \"transformations\": [{\"original\": str, "
    "\"replacement\": str, \"cardinality\": \"one_to_one\"|\"many_to_one\"}]}. Every "
    "transformation \"original\" MUST be copied verbatim from the USER text."
)


@dataclass(frozen=True)
class Transformation:
    original: str
    replacement: str
    cardinality: str = "one_to_one"


@dataclass
class RewriteResult:
    rewrite: str
    transformations: list[Transformation] = field(default_factory=list)


class Rewriter:
    def __init__(self, client: LocalLLMClient, temperature: float = 0.0):
        self._client = client
        self._temperature = temperature

    def rewrite(self, text: str, feedback: str = "") -> RewriteResult:
        user = text if not feedback else f"{text}\n\nREVISE — still leaking: {feedback}"
        content = self._client.chat(
            [{"role": "system", "content": _SYSTEM}, {"role": "user", "content": user}],
            temperature=self._temperature,
        )
        data = extract_last_json(content)
        rewrite = data.get("rewrite")
        if not isinstance(rewrite, str) or not rewrite:
            rewrite = text
        transforms: list[Transformation] = []
        for item in data.get("transformations", []):
            if not isinstance(item, dict):
                continue
            original = item.get("original")
            replacement = item.get("replacement")
            if not isinstance(original, str) or not isinstance(replacement, str) or not original:
                continue
            if original not in text:
                continue
            cardinality = item.get("cardinality")
            if cardinality not in ("one_to_one", "many_to_one"):
                cardinality = "one_to_one"
            transforms.append(Transformation(original, replacement, cardinality))
        return RewriteResult(rewrite, transforms)
