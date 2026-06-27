from __future__ import annotations

import logging
from typing import Callable

from faker import Faker

from privacy_gateway.core.errors import FailClosed

from .policy import EntityPolicy

logger = logging.getLogger(__name__)

_SAFE_EXTRA = set(" .-_@")

COMMON_WORDS = {
    "the", "and", "for", "are", "was", "name", "city", "house", "world", "data",
    "test", "user", "email", "phone", "value", "number", "address", "company",
    "country", "person", "secret", "today", "date", "time", "code", "thing",
    "people", "place", "thanks", "hello", "please", "system", "service",
}

FakerLike = Faker
AffixFn = Callable[[Faker], str]


def is_safe(s: str) -> bool:
    return bool(s) and all(c.isalpha() or c.isdigit() or c in _SAFE_EXTRA for c in s)


def normalize_charset(s: str) -> str:
    kept = "".join(c for c in s if c.isalpha() or c.isdigit() or c in _SAFE_EXTRA)
    return " ".join(kept.split())


class SurrogateFactory:
    def __init__(
        self,
        seed: int = 42,
        faker: Faker | None = None,
        affix_fn: AffixFn | None = None,
        max_attempts: int = 12,
    ):
        self._faker = faker or Faker(
            ["en_US", "de_DE", "fr_FR", "es_ES", "it_IT", "pt_PT"]
        )
        self._faker.seed_instance(seed)
        self._affix = affix_fn or (
            lambda f: "-" + f.bothify("?#?", letters="QXZJKV")
        )
        self.max_attempts = max_attempts
        self.regenerations = 0

    def generate(
        self,
        entity_type: str,
        policy: EntityPolicy,
        original: str,
        live_surrogates: set[str],
        live_originals: set[str],
        prompt_corpus: str = "",
    ) -> str:
        for affix in (False, True):
            for _ in range(self.max_attempts):
                cand = normalize_charset(policy.faker(self._faker))
                if affix:
                    cand = normalize_charset(cand + self._affix(self._faker))
                if self._accept(
                    cand, original, policy, live_surrogates, live_originals, prompt_corpus
                ):
                    return cand
                self.regenerations += 1
        logger.warning(
            "fail-closed: no safe surrogate for %s after %d attempts",
            entity_type,
            2 * self.max_attempts,
        )
        raise FailClosed(f"could not mint a safe surrogate for {entity_type}")

    def _accept(
        self,
        cand: str,
        original: str,
        policy: EntityPolicy,
        live_surrogates: set[str],
        live_originals: set[str],
        prompt_corpus: str,
    ) -> bool:
        if len(cand) < policy.min_len or not is_safe(cand):
            return False
        if cand == original:
            return False
        if not policy.restorable:
            return True
        if cand in live_originals or cand in live_surrogates:
            return False
        for s in live_surrogates:
            if cand in s or s in cand:
                return False
        if cand.lower() in COMMON_WORDS:
            return False
        if prompt_corpus and cand in prompt_corpus:
            return False
        return True
