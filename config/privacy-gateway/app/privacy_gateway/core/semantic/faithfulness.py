from __future__ import annotations

from typing import Protocol

from privacy_gateway.core.llm.client import LocalLLMClient
from privacy_gateway.core.llm.parse import extract_last_json

_JUDGE_SYSTEM = (
    "You are a faithfulness judge. Decide whether the REWRITE preserves the task-relevant meaning "
    "of the ORIGINAL — ignore details that were intentionally generalized or removed for privacy; "
    "penalize only added/invented facts or dropped task-relevant meaning. Reason first, then output "
    "a single fenced JSON object: {\"reasoning\": str, \"faithfulness\": float (0-1, 1=fully "
    "preserves meaning)}."
)


def _clamp01(x) -> float:
    try:
        return max(0.0, min(1.0, float(x)))
    except (TypeError, ValueError):
        return 0.0


class FaithfulnessScorer(Protocol):
    def score(self, original: str, rewrite: str) -> float: ...


class LLMJudgeScorer:
    def __init__(self, client: LocalLLMClient, temperature: float = 0.0):
        self._client = client
        self._temperature = temperature

    def score(self, original: str, rewrite: str) -> float:
        content = self._client.chat(
            [
                {"role": "system", "content": _JUDGE_SYSTEM},
                {"role": "user", "content": f"ORIGINAL:\n{original}\n\nREWRITE:\n{rewrite}"},
            ],
            temperature=self._temperature,
        )
        return _clamp01(extract_last_json(content).get("faithfulness"))
