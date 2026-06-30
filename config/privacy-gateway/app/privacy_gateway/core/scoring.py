from __future__ import annotations

from privacy_gateway.core.llm.client import LocalLLMClient
from privacy_gateway.core.llm.parse import extract_last_json
from privacy_gateway.core.models import Sufficiency

_FLOOR_THRESHOLD = 0.85

_JUDGE_SYSTEM = (
    "You are an adversary trying to re-identify the person described in the TEXT, which "
    "has already been anonymized. List each attribute you could still infer and estimate "
    "how rare it is. Reason first, then output a single fenced JSON object: "
    "{\"reasoning\": str, \"attributes\": [str], \"risk\": float (0-1, 1=uniquely "
    "identifiable), \"confidence\": float (0-1)}."
)


def _clamp01(x) -> float:
    try:
        return max(0.0, min(1.0, float(x)))
    except (TypeError, ValueError):
        return 0.0


def deterministic_floor(
    detector, anonymized_text: str, surrogates: set[str], threshold: float = _FLOOR_THRESHOLD
) -> float:
    for span in detector.detect(anonymized_text):
        value = anonymized_text[span.start : span.end]
        if value not in surrogates and span.score >= threshold:
            return 1.0
    return 0.0


def adversarial_risk(
    client: LocalLLMClient,
    anonymized_text: str,
    low_confidence: float = 0.5,
    max_samples: int = 3,
) -> tuple[float, float]:
    risks: list[float] = []
    confidence = 1.0
    for _ in range(max_samples):
        data = extract_last_json(
            client.chat(
                [
                    {"role": "system", "content": _JUDGE_SYSTEM},
                    {"role": "user", "content": anonymized_text},
                ],
                temperature=0.0,
            )
        )
        risks.append(_clamp01(data.get("risk")))
        confidence = _clamp01(data.get("confidence"))
        if confidence >= low_confidence:
            break
    return max(risks), confidence


def score_sufficiency(
    detector,
    anonymized_text: str,
    surrogates: set[str],
    client: LocalLLMClient | None = None,
    threshold: float = _FLOOR_THRESHOLD,
    low: float = 0.8,
    medium: float = 0.5,
) -> Sufficiency:
    reasons: list[str] = []
    floor = deterministic_floor(detector, anonymized_text, surrogates, threshold)
    if floor >= 1.0:
        reasons.append("deterministic_floor:residual_entity")
    llm_risk = 0.0
    if client is not None:
        llm_risk, confidence = adversarial_risk(client, anonymized_text)
        reasons.append(f"llm_risk={llm_risk:.2f};confidence={confidence:.2f}")
    risk = max(floor, llm_risk)
    sufficiency = 1.0 - risk
    if sufficiency >= low:
        bucket = "low"
    elif sufficiency >= medium:
        bucket = "medium"
    else:
        bucket = "high"
    return Sufficiency(score=sufficiency, bucket=bucket, reasons=tuple(reasons))
