from __future__ import annotations

import logging

from privacy_gateway.core.errors import LLMUnavailable
from privacy_gateway.core.llm.client import LocalLLMClient
from privacy_gateway.core.llm.parse import extract_last_json
from privacy_gateway.core.models import Sufficiency

logger = logging.getLogger(__name__)

_FLOOR_THRESHOLD = 0.85

_JUDGE_SYSTEM = (
    "You are a privacy auditor helping the owner of the TEXT check their anonymization "
    "before sharing it. Assess how re-identifiable the person described in the TEXT still "
    "is. List each attribute that could narrow identity and estimate how rare it is. "
    "Reason first, then output a single fenced JSON object: "
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
    occupied: list[tuple[int, int]] = []
    for s in surrogates:
        i = anonymized_text.find(s)
        while i >= 0:
            occupied.append((i, i + len(s)))
            i = anonymized_text.find(s, i + 1)
    for span in detector.detect(anonymized_text):
        if span.score < threshold:
            continue
        value = anonymized_text[span.start : span.end]
        if value in surrogates:
            continue
        if any(span.start < e and b < span.end for b, e in occupied):
            continue
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
        raw = client.chat(
            [
                {"role": "system", "content": _JUDGE_SYSTEM},
                {"role": "user", "content": anonymized_text},
            ],
            temperature=0.0,
        )
        try:
            data = extract_last_json(raw)
        except ValueError:
            logger.warning("judge sample unparseable: %.200s", raw)
            continue
        risks.append(_clamp01(data.get("risk")))
        confidence = _clamp01(data.get("confidence"))
        if confidence >= low_confidence:
            break
    if not risks:
        raise LLMUnavailable("adversarial judge produced no parseable samples")
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
