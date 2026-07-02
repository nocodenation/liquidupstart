from __future__ import annotations

from conftest import FakeLocalLLMClient

from privacy_gateway.core.semantic.loop import semantic_anonymize
from privacy_gateway.core.semantic.rewriter import Rewriter
from privacy_gateway.core.vault.store import Vault

TEXT = "The VP from Reykjavik signed off on it."
REWRITE_JSON = (
    '```json\n{"rewrite": "A senior leader from a European office signed off on it.", '
    '"transformations": [{"original": "VP from Reykjavik", "replacement": "senior leader from a '
    'European office", "cardinality": "many_to_one"}]}\n```'
)


class FakeScorer:
    def __init__(self, value):
        self.value = value
        self.calls = 0

    def score(self, original, rewrite):
        self.calls += 1
        return self.value


def _low_risk():
    return FakeLocalLLMClient('```json\n{"reasoning": "x", "attributes": [], "risk": 0.1, "confidence": 0.9}\n```')


def _high_risk():
    return FakeLocalLLMClient('```json\n{"reasoning": "x", "attributes": ["role"], "risk": 0.9, "confidence": 0.9}\n```')


def test_semantic_loop_accepts_high_faithfulness():
    rw = Rewriter(FakeLocalLLMClient(REWRITE_JSON))
    vault = Vault()
    res = semantic_anonymize(TEXT, rw, FakeScorer(0.95), vault, "c1", adversary_client=_low_risk())
    assert res.accepted is True
    assert res.faithfulness == 0.95
    assert any(e.transform_type == "generalization" for e in vault.entries("c1"))


def test_semantic_loop_rejects_low_faithfulness():
    rw = Rewriter(FakeLocalLLMClient(REWRITE_JSON))
    vault = Vault()
    res = semantic_anonymize(TEXT, rw, FakeScorer(0.5), vault, "c1", adversary_client=_low_risk())
    assert res.accepted is False
    assert vault.entries("c1") == []  # nothing recorded when the rewrite is rejected


def test_semantic_loop_caps_rounds():
    client = FakeLocalLLMClient(REWRITE_JSON)
    rw = Rewriter(client)
    vault = Vault()
    res = semantic_anonymize(
        TEXT, rw, FakeScorer(0.95), vault, "c1", adversary_client=_high_risk(), max_rounds=3
    )
    assert res.accepted is False
    assert res.rounds == 3
    assert len(client.calls) == 3  # rewriter invoked once per round, then gives up
