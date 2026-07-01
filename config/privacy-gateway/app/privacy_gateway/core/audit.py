from __future__ import annotations

import json
from collections import Counter
from pathlib import Path
from time import time as _time
from typing import Callable


class AuditLog:
    def __init__(
        self,
        path: str | Path,
        enabled: bool = True,
        clock: Callable[[], float] = _time,
    ):
        self.path = Path(path)
        self.enabled = enabled
        self._clock = clock

    def record(self, conversation_id: str, entries, backstop: str | None = None) -> None:
        if not self.enabled:
            return
        rec = {
            "ts": self._clock(),
            "conv": conversation_id[:8],
            "types": dict(Counter(e.entity_type for e in entries)),
            "backstop": backstop,
        }
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(rec) + "\n")
