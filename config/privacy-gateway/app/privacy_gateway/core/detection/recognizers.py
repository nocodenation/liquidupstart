from __future__ import annotations

from presidio_analyzer import EntityRecognizer, Pattern, PatternRecognizer

INTERNAL_HOSTNAME = "INTERNAL_HOSTNAME"
INTERNAL_ID = "INTERNAL_ID"

_HOSTNAME = Pattern(
    "internal-hostname",
    r"\b[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9-]+)*\.(?:internal|intra|corp|local|lan)\b",
    0.7,
)
_ID = Pattern("internal-id", r"\b[A-Z]{2,5}-\d{3,8}\b", 0.6)


def build_custom_recognizers(languages) -> list[EntityRecognizer]:
    out: list[EntityRecognizer] = []
    for lang in languages:
        out.append(
            PatternRecognizer(
                supported_entity=INTERNAL_HOSTNAME,
                supported_language=lang,
                patterns=[_HOSTNAME],
            )
        )
        out.append(
            PatternRecognizer(
                supported_entity=INTERNAL_ID,
                supported_language=lang,
                patterns=[_ID],
            )
        )
    return out
