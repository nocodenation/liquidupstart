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
from privacy_gateway.core.vault.persist import load, load_or_create_key
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


def build_vault(settings: Settings):
    ttl = settings.vault_ttl
    if not settings.vault_dir:
        return Vault(ttl_seconds=ttl), None, None
    import base64
    from pathlib import Path

    vdir = Path(settings.vault_dir)
    vdir.mkdir(parents=True, exist_ok=True)
    key = (
        base64.b64decode(settings.vault_key)
        if settings.vault_key
        else load_or_create_key(vdir / "vault.key")
    )
    path = vdir / "vault.enc"
    try:
        vault = load(path, key, ttl_seconds=ttl)
    except Exception:
        aside = path.with_suffix(".enc.unreadable")
        path.replace(aside)
        logger.error(
            "gateway: %s cannot be decrypted with the configured key; moved to %s, starting fresh",
            path, aside,
        )
        vault = Vault(ttl_seconds=ttl)
    logger.info("gateway: vault loaded from %s (%d convs)", path, len(vault._conv_entries))
    return vault, path, key


def build_gateway(settings: Settings) -> Gateway:
    logger.info("building gateway: loading NER models %s ...", SUPPORTED_LANGUAGES)
    base = Detector()
    client = build_llm_client(settings)
    detector = build_detector(settings, base, client)
    if isinstance(detector, CompositeDetector):
        logger.info("gateway: local-LLM second-pass detector enabled")
    vault, path, key = build_vault(settings)
    audit = None
    if settings.vault_dir and settings.audit_enable:
        from pathlib import Path

        from privacy_gateway.core.audit import AuditLog

        audit = AuditLog(Path(settings.vault_dir) / "audit.jsonl")
    gateway = Gateway(
        detector,
        vault,
        base_detector=base,
        llm_client=client,
        persist_path=path,
        persist_key=key,
        audit=audit,
    )
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
