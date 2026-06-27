from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Literal


@dataclass(frozen=True)
class Span:
    start: int
    end: int
    entity_type: str
    score: float
    language: str = ""


@dataclass(frozen=True)
class FieldRef:
    pointer: str
    get: Callable[[], str]
    set: Callable[[str], None]


@dataclass(frozen=True)
class Surrogate:
    original: str
    replacement: str
    entity_type: str
    restorable: bool = True


@dataclass
class AnonResult:
    text: str
    spans: list[Span] = field(default_factory=list)
    surrogates: list[Surrogate] = field(default_factory=list)


@dataclass(frozen=True)
class Sufficiency:
    score: float
    bucket: Literal["low", "medium", "high"]
    reasons: tuple[str, ...] = ()
