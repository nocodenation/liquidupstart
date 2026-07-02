from __future__ import annotations

from dataclasses import dataclass, field

from privacy_gateway.core.scoring import adversarial_risk
from privacy_gateway.core.semantic.faithfulness import FaithfulnessScorer
from privacy_gateway.core.semantic.rewriter import Rewriter, Transformation


@dataclass
class SemanticResult:
    rewrite: str
    faithfulness: float
    risk: float
    accepted: bool
    surfaced: bool
    rounds: int
    transformations: list[Transformation] = field(default_factory=list)


def semantic_anonymize(
    text: str,
    rewriter: Rewriter,
    scorer: FaithfulnessScorer,
    vault,
    conversation_id: str,
    adversary_client=None,
    accept: float = 0.85,
    surface: float = 0.70,
    max_risk: float = 0.5,
    max_rounds: int = 5,
    session_id: str = "",
) -> SemanticResult:
    feedback = ""
    last = SemanticResult(text, 0.0, 1.0, False, False, 0, [])
    for rnd in range(1, max_rounds + 1):
        result = rewriter.rewrite(text, feedback)
        faith = scorer.score(text, result.rewrite)
        if adversary_client is not None:
            risk, _ = adversarial_risk(adversary_client, result.rewrite)
        else:
            risk = 0.0
        last = SemanticResult(result.rewrite, faith, risk, False, False, rnd, [])

        if faith < surface:
            return last  # meaning broken — reject, revising won't restore faithfulness

        if risk <= max_risk:
            for t in result.transformations:
                vault.record_generalization(
                    t.original, t.replacement, t.cardinality, conversation_id, session_id
                )
            return SemanticResult(
                result.rewrite, faith, risk, True, faith < accept, rnd, result.transformations
            )

        feedback = (
            f"residual re-identification risk {risk:.2f}; generalize the remaining "
            "identifying details further while keeping the meaning"
        )
    return last
