from __future__ import annotations

import logging
import time
import uuid

from fastapi import APIRouter, Request, Response
from fastapi.responses import JSONResponse

from privacy_gateway.api.deps import get_gateway, get_upstream
from privacy_gateway.api.upstream import forward_headers
from privacy_gateway.core.adapters.anthropic_messages import (
    anonymize_request,
    deanonymize_response,
)
from privacy_gateway.core.errors import FailClosed

logger = logging.getLogger(__name__)
router = APIRouter()


@router.head("/")
@router.head("/anthropic")
def preflight() -> Response:
    return Response(status_code=200)


@router.post("/anthropic/v1/messages")
async def messages(request: Request) -> Response:
    started = time.perf_counter()
    gateway = get_gateway(request.app)
    upstream = get_upstream(request.app)
    body = await request.json()
    session = gateway.new_session(str(uuid.uuid4()))
    cid = session.conversation_id[:8]
    logger.info("POST /anthropic/v1/messages conv=%s", cid)

    try:
        anonymized = anonymize_request(body, session)
    except FailClosed as exc:
        logger.warning("conv=%s blocked (fail-closed): %s", cid, exc)
        return JSONResponse({"error": "fail_closed"}, status_code=400)

    logger.debug("conv=%s anonymized: %d restorable surrogates", cid, len(session.reverse_map()))
    resp = await upstream.forward(
        "/v1/messages",
        request.url.query,
        forward_headers(request.headers),
        anonymized,
    )
    elapsed = (time.perf_counter() - started) * 1000
    data = resp.json()
    if resp.status_code >= 400:
        logger.warning("conv=%s upstream error status=%d (%.0fms)", cid, resp.status_code, elapsed)
        return JSONResponse(data, status_code=resp.status_code)
    logger.info("conv=%s done upstream=%d (%.0fms)", cid, resp.status_code, elapsed)
    return JSONResponse(deanonymize_response(data, session), status_code=resp.status_code)
