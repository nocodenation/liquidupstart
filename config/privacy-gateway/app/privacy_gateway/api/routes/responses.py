from __future__ import annotations

import logging
import uuid

from fastapi import APIRouter, Request, Response
from fastapi.responses import JSONResponse

from privacy_gateway.api.deps import get_gateway
from privacy_gateway.api.exchange import forward_exchange
from privacy_gateway.api.routes.openai import _upstream_for, provider_upstream
from privacy_gateway.core.adapters.openai_responses import (
    anonymize_request,
    deanonymize_response,
)
from privacy_gateway.core.errors import FailClosed
from privacy_gateway.core.streaming.responses_deanon import ResponsesDeanonStreamer

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/{provider}/v1/responses")
async def responses(provider: str, request: Request) -> Response:
    settings = request.app.state.settings
    base = provider_upstream(settings, provider)
    if base is None:
        return JSONResponse({"error": "unknown_provider"}, status_code=404)

    gateway = get_gateway(request.app)
    body = await request.json()
    session = gateway.new_session(str(uuid.uuid4()))
    cid = session.conversation_id[:8]
    logger.info("POST /%s/v1/responses conv=%s", provider, cid)

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
        forward_path="/v1/responses",
        deanonymize=deanonymize_response,
        make_streamer=ResponsesDeanonStreamer,
        is_stream=body.get("stream") is True,
    )
