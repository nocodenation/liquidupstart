from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from privacy_gateway.core.models import Sufficiency
from privacy_gateway.core.scoring import score_sufficiency


@dataclass(frozen=True)
class GateResult:
    sufficiency: Sufficiency | None
    blocked: bool
    header: str | None


def _gather_text(anonymized: dict) -> str:
    parts: list[str] = []

    def add_content(content: Any) -> None:
        if isinstance(content, str):
            parts.append(content)
        elif isinstance(content, list):
            for block in content:
                if isinstance(block, dict) and isinstance(block.get("text"), str):
                    parts.append(block["text"])

    add_content(anonymized.get("system"))
    add_content(anonymized.get("instructions"))
    for msg in anonymized.get("messages", []):
        if isinstance(msg, dict):
            add_content(msg.get("content"))
    inp = anonymized.get("input")
    if isinstance(inp, str):
        parts.append(inp)
    elif isinstance(inp, list):
        for item in inp:
            if isinstance(item, dict):
                add_content(item.get("content"))
    return "\n".join(p for p in parts if p)


def evaluate_gate(gateway, session, anonymized: dict, settings) -> GateResult:
    mode = getattr(settings, "gate_mode", "log")
    if mode == "off":
        return GateResult(None, False, None)
    text = _gather_text(anonymized)
    if not text.strip():
        return GateResult(None, False, None)
    surrogates = {e.replacement for e in gateway.vault.entries(session.conversation_id)}
    suff = score_sufficiency(
        gateway.base_detector,
        text,
        surrogates,
        client=gateway.llm_client,
        low=getattr(settings, "sufficiency_low", 0.8),
        medium=getattr(settings, "sufficiency_medium", 0.5),
    )
    header = f"{suff.bucket};score={suff.score:.2f}"
    blocked = mode == "block" and suff.bucket == "high"
    return GateResult(suff, blocked, header)
