from __future__ import annotations

import json
import re
from typing import Any

_FENCE = re.compile(r"```(?:json)?\s*(\{.*?\})\s*```", re.DOTALL)


def extract_last_json(text: str) -> Any:
    for match in reversed(list(_FENCE.finditer(text))):
        try:
            return json.loads(match.group(1))
        except json.JSONDecodeError:
            continue
    end = text.rfind("}")
    starts = [i for i, c in enumerate(text) if c == "{" and i <= end]
    for start in reversed(starts):
        try:
            return json.loads(text[start : end + 1])
        except json.JSONDecodeError:
            continue
    raise ValueError("no JSON object found in model output")
