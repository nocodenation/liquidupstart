from __future__ import annotations

from typing import Protocol

from presidio_analyzer import AnalyzerEngine, EntityRecognizer, RecognizerRegistry
from presidio_analyzer.nlp_engine import NlpEngineProvider

SPACY_MODELS = {
    "en": "en_core_web_md",
    "de": "de_core_news_md",
    "fr": "fr_core_news_md",
    "es": "es_core_news_md",
    "it": "it_core_news_md",
    "pt": "pt_core_news_md",
}
SUPPORTED_LANGUAGES = list(SPACY_MODELS)


class EngineProvider(Protocol):
    def build_analyzer(
        self, recognizers: list[EntityRecognizer] | None = None
    ) -> AnalyzerEngine: ...


class SpacyMultiEngine:
    def __init__(self, languages=SUPPORTED_LANGUAGES, models=None):
        self.languages = list(languages)
        self.models = models or SPACY_MODELS

    def build_analyzer(self, recognizers=None) -> AnalyzerEngine:
        config = {
            "nlp_engine_name": "spacy",
            "models": [
                {"lang_code": lang, "model_name": self.models[lang]}
                for lang in self.languages
            ],
        }
        nlp_engine = NlpEngineProvider(nlp_configuration=config).create_engine()
        registry = RecognizerRegistry(supported_languages=self.languages)
        registry.load_predefined_recognizers(
            languages=self.languages, nlp_engine=nlp_engine
        )
        for rec in recognizers or []:
            registry.add_recognizer(rec)
        return AnalyzerEngine(
            nlp_engine=nlp_engine,
            registry=registry,
            supported_languages=self.languages,
        )
