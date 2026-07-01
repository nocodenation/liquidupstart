from __future__ import annotations

import json
from typing import Any

from privacy_gateway.core.detection.secrets import scan_secrets
from privacy_gateway.core.models import Span


def rescan_outbound(text: str, mode: str) -> list[Span]:
    if mode == "off":
        return []
    return scan_secrets(text)


def scan_payload(payload: Any, mode: str) -> list[Span]:
    return rescan_outbound(json.dumps(payload, ensure_ascii=False), mode)
