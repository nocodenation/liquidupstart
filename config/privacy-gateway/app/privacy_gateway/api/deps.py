from __future__ import annotations

import logging

from fastapi import FastAPI

from privacy_gateway.api.upstream import Upstream
from privacy_gateway.config import Settings
from privacy_gateway.core.detection.detector import Detector
from privacy_gateway.core.detection.presidio import SUPPORTED_LANGUAGES
from privacy_gateway.core.gateway import Gateway
from privacy_gateway.core.vault.store import Vault

logger = logging.getLogger(__name__)


def build_gateway(settings: Settings) -> Gateway:
    logger.info("building gateway: loading NER models %s ...", SUPPORTED_LANGUAGES)
    gateway = Gateway(Detector(), Vault())
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
