import pytest

from privacy_gateway.core.errors import FailClosed
from privacy_gateway.core.vault.policy import EntityPolicy
from privacy_gateway.core.vault.store import Vault
from privacy_gateway.core.vault.surrogate import (
    SurrogateFactory,
    is_safe,
    normalize_charset,
)


def _batch(vault, conv):
    originals = []
    for i in range(40):
        originals.append(("PERSON", f"Person Number{i}"))
        originals.append(("LOCATION", f"Town Number{i}"))
        originals.append(("EMAIL_ADDRESS", f"user{i}@example.org"))
    originals += [
        ("INTERNAL_HOSTNAME", "db.acme-prod.internal"),
        ("INTERNAL_ID", "ACME-12345"),
        ("SECRET", "AKIAIOSFODNN7EXAMPLE"),
    ]
    return [vault.mint(t, o, conv) for t, o in originals]


def test_bijective_and_safe():
    v = Vault()
    entries = _batch(v, "c")
    originals = {e.original for e in entries}
    for e in entries:
        assert e.replacement != e.original
        assert is_safe(e.replacement)
        assert e.replacement not in originals


def test_restorable_surrogates_unique_and_non_substring():
    v = Vault()
    entries = _batch(v, "c")
    surrogates = [e.replacement for e in entries if e.restorable]
    assert len(surrogates) == len(set(surrogates))
    for i, a in enumerate(surrogates):
        for j, b in enumerate(surrogates):
            if i != j:
                assert a not in b


def test_consistency_same_and_cross_conversation():
    v = Vault()
    a1 = v.mint("PERSON", "Alice Johnson", "convA")
    a2 = v.mint("PERSON", "Alice Johnson", "convA")
    b = v.mint("PERSON", "Alice Johnson", "convB")
    assert a1.replacement == a2.replacement == b.replacement


def test_non_restorable_excluded_from_rev():
    v = Vault()
    date = v.mint("DATE_TIME", "2019-04-12", "c")
    age = v.mint("AGE", "42", "c")
    phone = v.mint("PHONE_NUMBER", "+49 30 1234567", "c")
    person = v.mint("PERSON", "Alice Johnson", "c")
    rev = v.reverse_map("c")
    assert date.replacement not in rev
    assert age.replacement not in rev
    assert phone.replacement not in rev
    assert person.replacement in rev
    assert all(e.replacement != e.original for e in (date, age, phone))


def test_cross_conversation_isolation():
    v = Vault()
    a = v.mint("PERSON", "Carol Danvers", "convA")
    v.mint("PERSON", "Dave Lister", "convB")
    assert a.replacement not in v.reverse_map("convB")


def test_fail_closed_when_no_safe_candidate():
    factory = SurrogateFactory(affix_fn=lambda f: "")
    policy = EntityPolicy(restorable=True, faker=lambda f: "")
    with pytest.raises(FailClosed):
        factory.generate("X", policy, "orig", set(), set(), "")


def test_affix_recovers_distinctiveness():
    factory = SurrogateFactory(affix_fn=lambda f: "-Z9")
    policy = EntityPolicy(restorable=True, faker=lambda f: "house")
    out = factory.generate("X", policy, "orig", set(), set(), "")
    assert out.startswith("house")
    assert out != "house"


def test_surrogate_not_drawn_from_prompt_corpus():
    draws = iter(["Berlin", "Berlin", "Munich"])
    policy = EntityPolicy(restorable=True, faker=lambda f: next(draws))
    factory = SurrogateFactory()
    out = factory.generate(
        "LOCATION", policy, "x", set(), set(), prompt_corpus="I live in Berlin"
    )
    assert out == "Munich"


def test_ttl_purges_live_and_rev():
    clock = {"t": 1000.0}
    v = Vault(clock=lambda: clock["t"], ttl_seconds=100)
    alice = v.mint("PERSON", "Alice Johnson", "c")
    assert alice.replacement in v.reverse_map("c")
    clock["t"] = 1300.0
    v.mint("PERSON", "Bob Stone", "c")
    assert alice.replacement not in v.reverse_map("c")


def test_fwd_persists_across_ttl_purge():
    clock = {"t": 1000.0}
    v = Vault(clock=lambda: clock["t"], ttl_seconds=100)
    first = v.mint("PERSON", "Alice Johnson", "c")
    clock["t"] = 1300.0
    again = v.mint("PERSON", "Alice Johnson", "c")
    assert again.replacement == first.replacement


def test_normalize_and_is_safe():
    assert normalize_charset('Al"ice  Sm\\ith') == "Alice Smith"
    assert is_safe("Alice-Smith_1.x@y")
    assert not is_safe('a"b')
    assert not is_safe("a\\b")
    assert not is_safe("")
