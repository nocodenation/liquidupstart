from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Metrics:
    minted: int = 0
    reused: int = 0
    regenerations: int = 0
