from __future__ import annotations

from presidio_analyzer.predefined_recognizers import SpacyRecognizer

from privacy_gateway.core.models import Span

from .language import LanguageRouter, is_short_or_structured
from .presidio import SUPPORTED_LANGUAGES, SpacyMultiEngine
from .recognizers import build_custom_recognizers
from .secrets import scan_secrets


def _priority(s: Span) -> int:
    if s.entity_type == "SECRET":
        return 3
    if s.entity_type.startswith("INTERNAL_"):
        return 2
    return 1


def _overlaps(a: Span, b: Span) -> bool:
    return a.start < b.end and b.start < a.end


def merge_spans(spans: list[Span]) -> list[Span]:
    ordered = sorted(
        spans, key=lambda s: (-_priority(s), -(s.end - s.start), -s.score, s.start)
    )
    kept: list[Span] = []
    for s in ordered:
        if any(_overlaps(s, k) for k in kept):
            continue
        kept.append(s)
    return sorted(kept, key=lambda s: (s.start, s.end))


class Detector:
    def __init__(self, engine_provider=None, router=None, languages=SUPPORTED_LANGUAGES):
        provider = engine_provider or SpacyMultiEngine(languages)
        self.analyzer = provider.build_analyzer(build_custom_recognizers(languages))
        self.router = router or LanguageRouter(languages)
        self._pattern_entities = self._non_ner_entities()

    def _non_ner_entities(self) -> list[str]:
        ents: set[str] = set()
        for rec in self.analyzer.registry.recognizers:
            if isinstance(rec, SpacyRecognizer):
                continue
            ents.update(rec.supported_entities)
        return sorted(ents)

    def detect(self, text: str) -> list[Span]:
        if is_short_or_structured(text):
            lang = self.router.default
            results = self.analyzer.analyze(
                text=text, language=lang, entities=self._pattern_entities
            )
        else:
            lang, _ = self.router.detect(text)
            results = self.analyzer.analyze(text=text, language=lang)
        spans = [
            Span(r.start, r.end, r.entity_type, float(r.score), lang) for r in results
        ]
        spans += scan_secrets(text, lang)
        return merge_spans(spans)
