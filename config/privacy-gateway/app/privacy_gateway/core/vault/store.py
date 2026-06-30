from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from time import time as _time
from typing import Callable

from privacy_gateway.core.metrics import Metrics

from .policy import policy_for
from .surrogate import SurrogateFactory


@dataclass(frozen=True)
class VaultEntry:
    original: str
    replacement: str
    entity_type: str
    conversation_id: str
    session_id: str
    restorable: bool
    transform_type: str = "surrogate"
    cardinality: str = "one_to_one"
    created_at: float = 0.0


class Vault:
    def __init__(
        self,
        factory: SurrogateFactory | None = None,
        clock: Callable[[], float] = _time,
        ttl_seconds: float | None = None,
    ):
        self._factory = factory or SurrogateFactory()
        self._clock = clock
        self._ttl = ttl_seconds
        self._fwd: dict[tuple[str, str], VaultEntry] = {}
        self._rev: dict[str, dict[str, VaultEntry]] = defaultdict(dict)
        self._live_surrogates: dict[str, set[str]] = defaultdict(set)
        self._live_originals: dict[str, set[str]] = defaultdict(set)
        self._conv_entries: dict[str, list[VaultEntry]] = defaultdict(list)
        self.minted = 0
        self.reused = 0

    def mint(
        self,
        entity_type: str,
        original: str,
        conversation_id: str,
        session_id: str = "",
        prompt_corpus: str = "",
    ) -> VaultEntry:
        self._maybe_purge(conversation_id)
        entry = self._fwd.get((entity_type, original))
        if entry is not None:
            self.reused += 1
        else:
            self.minted += 1
            policy = policy_for(entity_type)
            replacement = self._factory.generate(
                entity_type,
                policy,
                original,
                self._live_surrogates[conversation_id],
                self._live_originals[conversation_id],
                prompt_corpus,
            )
            entry = VaultEntry(
                original=original,
                replacement=replacement,
                entity_type=entity_type,
                conversation_id=conversation_id,
                session_id=session_id,
                restorable=policy.restorable,
                created_at=self._clock(),
            )
            self._fwd[(entity_type, original)] = entry
        self._register(entry, conversation_id)
        return entry

    def record_generalization(
        self,
        original: str,
        replacement: str,
        cardinality: str,
        conversation_id: str,
        session_id: str = "",
    ) -> VaultEntry:
        entry = VaultEntry(
            original=original,
            replacement=replacement,
            entity_type="GENERALIZATION",
            conversation_id=conversation_id,
            session_id=session_id,
            restorable=False,
            transform_type="generalization",
            cardinality=cardinality,
            created_at=self._clock(),
        )
        self._register(entry, conversation_id)
        return entry

    def reverse_map(self, conversation_id: str) -> dict[str, str]:
        return {r: e.original for r, e in self._rev[conversation_id].items()}

    def metrics(self) -> Metrics:
        return Metrics(
            minted=self.minted,
            reused=self.reused,
            regenerations=self._factory.regenerations,
        )

    def entries(self, conversation_id: str) -> list[VaultEntry]:
        return list(self._conv_entries[conversation_id])

    def _register(self, entry: VaultEntry, conversation_id: str) -> None:
        if entry.replacement in self._live_surrogates[conversation_id]:
            return
        self._conv_entries[conversation_id].append(entry)
        self._live_surrogates[conversation_id].add(entry.replacement)
        self._live_originals[conversation_id].add(entry.original)
        if entry.restorable:
            self._rev[conversation_id][entry.replacement] = entry

    def _maybe_purge(self, conversation_id: str) -> None:
        if self._ttl is None:
            return
        now = self._clock()
        entries = self._conv_entries[conversation_id]
        keep = [e for e in entries if now - e.created_at <= self._ttl]
        if len(keep) == len(entries):
            return
        self._conv_entries[conversation_id] = keep
        self._live_surrogates[conversation_id] = {e.replacement for e in keep}
        self._live_originals[conversation_id] = {e.original for e in keep}
        self._rev[conversation_id] = {
            e.replacement: e for e in keep if e.restorable
        }
