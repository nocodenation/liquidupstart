from __future__ import annotations

import logging

from fastapi import FastAPI

from privacy_gateway.api.upstream import Upstream
from privacy_gateway.config import Settings
from privacy_gateway.core.detection.detector import CompositeDetector, Detector
from privacy_gateway.core.detection.presidio import SUPPORTED_LANGUAGES
from privacy_gateway.core.gateway import Gateway
from privacy_gateway.core.llm.client import OpenAICompatClient
from privacy_gateway.core.llm.second_pass import SecondPassDetector
from privacy_gateway.core.vault.store import Vault

logger = logging.getLogger(__name__)


def build_llm_client(settings: Settings):
    if not settings.local_llm_enable or not settings.local_llm_api_base:
        return None
    return OpenAICompatClient(
        settings.local_llm_api_base,
        settings.local_llm_api_key,
        settings.local_llm_model,
        settings.request_timeout,
    )


def build_detector(settings: Settings, base: Detector, client):
    if settings.local_llm_enable and client is not None:
        return CompositeDetector(base, SecondPassDetector(client))
    return base


def build_gateway(settings: Settings) -> Gateway:
    logger.info("building gateway: loading NER models %s ...", SUPPORTED_LANGUAGES)
    base = Detector()
    client = build_llm_client(settings)
    detector = build_detector(settings, base, client)
    if isinstance(detector, CompositeDetector):
        logger.info("gateway: local-LLM second-pass detector enabled")
    gateway = Gateway(detector, Vault(), base_detector=base, llm_client=client)
    logger.info("gateway ready")
    return gateway


def build_upstream(settings: Settings) -> Upstream:
    return Upstream(settings.upstream, settings.request_timeout)


def get_gateway(app: FastAPI) -> Gateway:
    if getattr(app.state, "gateway", None) is None:
        app.state.gateway = build_gateway(app.state.settings)
    return app.state.gateway


def get_upstream(app: FastAPI) -> Upstream:
    if getattr(app.state, "upstream", None) is None:
        app.state.upstream = build_upstream(app.state.settings)
    return app.state.upstream
