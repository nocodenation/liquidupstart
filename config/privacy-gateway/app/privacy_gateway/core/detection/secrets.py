from __future__ import annotations

from detect_secrets.core import scan
from detect_secrets.settings import transient_settings

from privacy_gateway.core.models import Span

PLUGINS = [
    {"name": "AWSKeyDetector"},
    {"name": "BasicAuthDetector"},
    {"name": "GitHubTokenDetector"},
    {"name": "JwtTokenDetector"},
    {"name": "PrivateKeyDetector"},
    {"name": "SlackDetector"},
    {"name": "StripeDetector"},
]


def scan_secrets(text: str, language: str = "", min_length: int = 8) -> list[Span]:
    spans: list[Span] = []
    with transient_settings({"plugins_used": PLUGINS}):
        offset = 0
        for line in text.splitlines(keepends=True):
            stripped = line.rstrip("\n")
            for secret in scan.scan_line(stripped):
                value = secret.secret_value
                if not value or len(value) < min_length:
                    continue
                idx = stripped.find(value)
                if idx == -1:
                    continue
                start = offset + idx
                spans.append(Span(start, start + len(value), "SECRET", 0.9, language))
            offset += len(line)
    return spans
