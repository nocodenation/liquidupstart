from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from typing import Callable

from fastapi import APIRouter, Request, Response
from fastapi.responses import JSONResponse

from privacy_gateway.api.deps import get_gateway
from privacy_gateway.api.exchange import forward_exchange
from privacy_gateway.api.routes.openai import _upstream_for
from privacy_gateway.core.adapters import openai_chat, openai_responses
from privacy_gateway.core.errors import FailClosed
from privacy_gateway.core.streaming.openai_deanon import OpenAIDeanonStreamer
from privacy_gateway.core.streaming.responses_deanon import ResponsesDeanonStreamer

logger = logging.getLogger(__name__)
router = APIRouter()


@dataclass(frozen=True)
class Vendor:
    upstream: str
    anonymize: Callable
    deanonymize: Callable
    make_streamer: Callable
    enable_attr: str


VENDOR_MAP: dict[str, Vendor] = {
    "api.x.ai": Vendor(
        "https://api.x.ai", openai_chat.anonymize_request,
        openai_chat.deanonymize_response, OpenAIDeanonStreamer, "enable_grok",
    ),
    "api.githubcopilot.com": Vendor(
        "https://api.githubcopilot.com", openai_chat.anonymize_request,
        openai_chat.deanonymize_response, OpenAIDeanonStreamer, "enable_copilot",
    ),
    "chatgpt.com": Vendor(
        "https://chatgpt.com", openai_responses.anonymize_request,
        openai_responses.deanonymize_response, ResponsesDeanonStreamer, "enable_codex",
    ),
}


def _resolve(settings, host: str) -> Vendor | None:
    vendor = VENDOR_MAP.get(host.split(":")[0])
    if vendor is None or not getattr(settings, vendor.enable_attr, False):
        return None
    return vendor


@router.post("/{full_path:path}")
async def mode_b(full_path: str, request: Request) -> Response:
    settings = request.app.state.settings
    host = request.headers.get("host", "")
    vendor = _resolve(settings, host)
    if vendor is None:
        return JSONResponse({"error": "not_found"}, status_code=404)

    gateway = get_gateway(request.app)
    body = await request.json()
    session = gateway.new_session(str(uuid.uuid4()))
    cid = session.conversation_id[:8]
    logger.info("mode-B POST host=%s /%s conv=%s", host, full_path, cid)

    try:
        anonymized = vendor.anonymize(body, session)
    except FailClosed as exc:
        logger.warning("conv=%s blocked (fail-closed): %s", cid, exc)
        return JSONResponse({"error": "fail_closed"}, status_code=400)

    upstream = _upstream_for(request.app, vendor.upstream)
    return await forward_exchange(
        request=request,
        gateway=gateway,
        settings=settings,
        session=session,
        anonymized=anonymized,
        upstream=upstream,
        forward_path="/" + full_path,
        deanonymize=vendor.deanonymize,
        make_streamer=vendor.make_streamer,
        is_stream=body.get("stream") is True,
    )
