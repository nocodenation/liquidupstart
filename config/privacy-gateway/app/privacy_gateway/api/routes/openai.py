from __future__ import annotations

import logging
import uuid

from fastapi import APIRouter, Request, Response
from fastapi.responses import JSONResponse

from privacy_gateway.api.deps import get_gateway
from privacy_gateway.api.exchange import forward_exchange
from privacy_gateway.api.upstream import Upstream
from privacy_gateway.core.adapters.openai_chat import (
    anonymize_request,
    deanonymize_response,
)
from privacy_gateway.core.errors import FailClosed
from privacy_gateway.core.streaming.openai_deanon import OpenAIDeanonStreamer

logger = logging.getLogger(__name__)
router = APIRouter()


def provider_upstream(settings, provider: str) -> str | None:
    return {"openai": settings.openai_upstream, "xai": settings.xai_upstream}.get(provider)


def _upstream_for(app, base: str):
    injected = getattr(app.state, "upstream", None)
    if injected is not None:
        return injected
    return Upstream(base, app.state.settings.request_timeout)


@router.post("/{provider}/v1/chat/completions")
async def chat_completions(provider: str, request: Request) -> Response:
    settings = request.app.state.settings
    base = provider_upstream(settings, provider)
    if base is None:
        return JSONResponse({"error": "unknown_provider"}, status_code=404)

    gateway = get_gateway(request.app)
    body = await request.json()
    session = gateway.new_session(str(uuid.uuid4()))
    cid = session.conversation_id[:8]
    logger.info("POST /%s/v1/chat/completions conv=%s", provider, cid)

    try:
        anonymized = anonymize_request(body, session)
    except FailClosed as exc:
        logger.warning("conv=%s blocked (fail-closed): %s", cid, exc)
        return JSONResponse({"error": "fail_closed"}, status_code=400)

    upstream = _upstream_for(request.app, base)

    return await forward_exchange(
        request=request,
        gateway=gateway,
        settings=settings,
        session=session,
        anonymized=anonymized,
        upstream=upstream,
        forward_path="/v1/chat/completions",
        deanonymize=deanonymize_response,
        make_streamer=OpenAIDeanonStreamer,
        is_stream=body.get("stream") is True,
    )
