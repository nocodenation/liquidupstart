from __future__ import annotations

import json
import logging
import uuid

from fastapi import APIRouter, Request, Response
from fastapi.responses import JSONResponse, StreamingResponse

from privacy_gateway.api.deps import get_gateway
from privacy_gateway.api.upstream import Upstream, forward_headers
from privacy_gateway.core.adapters.openai_chat import (
    anonymize_request,
    deanonymize_response,
)
from privacy_gateway.core.errors import FailClosed
from privacy_gateway.core.gate import evaluate_gate
from privacy_gateway.core.streaming.openai_deanon import OpenAIDeanonStreamer
from privacy_gateway.core.streaming.sse import SSEFramer

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

    gate = evaluate_gate(gateway, session, anonymized, settings)
    if gate.blocked:
        logger.warning("conv=%s egress blocked: risk=%s", cid, gate.header)
        return JSONResponse({"error": "egress_blocked", "risk": gate.header}, status_code=403)

    if body.get("stream") is True:
        logger.info("conv=%s streaming", cid)
        resp = await _stream_response(request, upstream, session, anonymized, cid)
        _attach_risk(resp, gate.header)
        return resp

    resp = await upstream.forward(
        "/v1/chat/completions",
        request.url.query,
        forward_headers(request.headers),
        anonymized,
    )
    data = resp.json()
    if resp.status_code >= 400:
        logger.warning("conv=%s upstream error status=%d", cid, resp.status_code)
        return JSONResponse(data, status_code=resp.status_code)
    out = JSONResponse(deanonymize_response(data, session), status_code=resp.status_code)
    _attach_risk(out, gate.header)
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
    ctx = upstream.stream("/v1/chat/completions", query, headers, anonymized)
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
        streamer = OpenAIDeanonStreamer(session.reverse_map())
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
