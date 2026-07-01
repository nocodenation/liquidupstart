from __future__ import annotations

import json
import logging
import time
import uuid

from fastapi import APIRouter, Request, Response
from fastapi.responses import JSONResponse, StreamingResponse

from privacy_gateway.api.deps import get_gateway, get_upstream
from privacy_gateway.api.upstream import enforce_backstop, forward_headers
from privacy_gateway.core.adapters.anthropic_messages import (
    anonymize_request,
    deanonymize_response,
)
from privacy_gateway.core.errors import FailClosed
from privacy_gateway.core.gate import evaluate_gate
from privacy_gateway.core.streaming.deanon import DeanonStreamer
from privacy_gateway.core.streaming.sse import SSEFramer

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

    gate = evaluate_gate(gateway, session, anonymized, request.app.state.settings)
    if gate.blocked:
        logger.warning("conv=%s egress blocked: risk=%s", cid, gate.header)
        return JSONResponse({"error": "egress_blocked", "risk": gate.header}, status_code=403)

    blocked = enforce_backstop(anonymized, request.app.state.settings, cid)
    if blocked is not None:
        gateway.finalize(session.conversation_id, "blocked")
        return blocked

    if body.get("stream") is True:
        logger.info("conv=%s streaming", cid)
        resp = await _stream_response(request, upstream, session, anonymized, cid)
        _attach_risk(resp, gate.header)
        gateway.finalize(session.conversation_id, "ok")
        return resp

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
    out = JSONResponse(deanonymize_response(data, session), status_code=resp.status_code)
    _attach_risk(out, gate.header)
    gateway.finalize(session.conversation_id, "ok")
    return out


def _attach_risk(response, header: str | None) -> None:
    if header is not None:
        response.headers["x-privacy-gateway-risk"] = header


async def _read_all(resp) -> bytes:
    if hasattr(resp, "aread"):
        return await resp.aread()
    data = b""
    async for chunk in resp.aiter_bytes():
        data += chunk
    return data


async def _stream_response(request: Request, upstream, session, anonymized: dict, cid: str):
    query = request.url.query
    headers = forward_headers(request.headers)
    ctx = upstream.stream("/v1/messages", query, headers, anonymized)
    resp = await ctx.__aenter__()

    if resp.status_code >= 400:
        raw = await _read_all(resp)
        await ctx.__aexit__(None, None, None)
        logger.warning("conv=%s upstream error status=%d (stream)", cid, resp.status_code)
        try:
            payload = json.loads(raw)
        except ValueError:
            payload = {"error": "upstream_error"}
        return JSONResponse(payload, status_code=resp.status_code)

    async def gen():
        framer = SSEFramer()
        streamer = DeanonStreamer(session.reverse_map())
        try:
            async for chunk in resp.aiter_bytes():
                for frame in framer.feed(chunk):
                    for out in streamer.process(frame):
                        yield out
            for frame in framer.flush():
                for out in streamer.process(frame):
                    yield out
            for out in streamer.finish():
                yield out
        finally:
            await ctx.__aexit__(None, None, None)

    return StreamingResponse(gen(), media_type="text/event-stream")
