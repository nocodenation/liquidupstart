from __future__ import annotations

from lingua import Language, LanguageDetectorBuilder

LINGUA_LANGS = {
    "en": Language.ENGLISH,
    "de": Language.GERMAN,
    "fr": Language.FRENCH,
    "es": Language.SPANISH,
    "it": Language.ITALIAN,
    "pt": Language.PORTUGUESE,
}


def is_short_or_structured(text: str) -> bool:
    t = text.strip()
    if not t:
        return True
    if sum(c.isalpha() for c in t) / len(t) < 0.5:
        return True
    if " " in t:
        return False
    return len(t) < 24


class LanguageRouter:
    def __init__(self, languages, default="en", min_confidence=0.5):
        self.default = default if default in languages else languages[0]
        self.min_confidence = min_confidence
        self._supported = set(languages)
        langs = [LINGUA_LANGS[lang] for lang in languages if lang in LINGUA_LANGS]
        self._detector = LanguageDetectorBuilder.from_languages(*langs).build()

    def detect(self, text: str) -> tuple[str, float]:
        if is_short_or_structured(text):
            return self.default, 0.0
        values = self._detector.compute_language_confidence_values(text)
        if not values:
            return self.default, 0.0
        top = values[0]
        code = top.language.iso_code_639_1.name.lower()
        if top.value < self.min_confidence or code not in self._supported:
            return self.default, top.value
        return code, top.value
