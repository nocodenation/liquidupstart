from __future__ import annotations

from conftest import FakeLocalLLMClient

from privacy_gateway.core.restore import restore_text
from privacy_gateway.core.semantic.rewriter import Rewriter
from privacy_gateway.core.vault.store import Vault

TEXT = "John, the VP who relocated from our Reykjavik office, leads the team."

CASSETTE = (
    '```json\n{"rewrite": "A senior leader who recently transferred from a European office '
    'leads the team.", "transformations": [{"original": "VP who relocated from our Reykjavik '
    'office", "replacement": "senior leader who recently transferred from a European office", '
    '"cardinality": "many_to_one"}, {"original": "Nonexistent phrase", "replacement": "x", '
    '"cardinality": "one_to_one"}]}\n```'
)


def test_rewriter_generalizes_and_records():
    rw = Rewriter(FakeLocalLLMClient(CASSETTE))
    result = rw.rewrite(TEXT)

    assert "Reykjavik" not in result.rewrite
    # the hallucinated (non-substring) transformation is dropped; only the grounded one survives
    assert len(result.transformations) == 1
    assert result.transformations[0].cardinality == "many_to_one"

    vault = Vault()
    for t in result.transformations:
        vault.record_generalization(t.original, t.replacement, t.cardinality, "c1")

    entries = vault.entries("c1")
    assert len(entries) == 1
    assert entries[0].transform_type == "generalization"
    assert entries[0].restorable is False


def test_generalization_not_restorable():
    vault = Vault()
    vault.record_generalization(
        "VP who relocated from our Reykjavik office",
        "senior leader from a European office",
        "many_to_one",
        "c1",
    )
    # never enters the reverse map -> never literal-restored
    assert vault.reverse_map("c1") == {}
    reply = "We spoke with a senior leader from a European office about it."
    assert restore_text(reply, vault.reverse_map("c1")) == reply
