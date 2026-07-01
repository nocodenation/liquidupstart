from __future__ import annotations

import json
import logging

from fastapi import Request
from fastapi.responses import JSONResponse, Response, StreamingResponse

from privacy_gateway.api.upstream import enforce_backstop, forward_headers
from privacy_gateway.core.gate import evaluate_gate
from privacy_gateway.core.streaming.sse import SSEFramer

logger = logging.getLogger(__name__)


def attach_risk(response, header: str | None) -> None:
    if header is not None:
        response.headers["x-privacy-gateway-risk"] = header


async def _read_all(resp) -> bytes:
    if hasattr(resp, "aread"):
        return await resp.aread()
    data = b""
    async for chunk in resp.aiter_bytes():
        data += chunk
    return data


async def forward_exchange(
    *,
    request: Request,
    gateway,
    settings,
    session,
    anonymized: dict,
    upstream,
    forward_path: str,
    deanonymize,
    make_streamer,
    is_stream: bool,
):
    cid = session.conversation_id[:8]

    gate = evaluate_gate(gateway, session, anonymized, settings)
    if gate.blocked:
        logger.warning("conv=%s egress blocked: risk=%s", cid, gate.header)
        return JSONResponse({"error": "egress_blocked", "risk": gate.header}, status_code=403)

    blocked = enforce_backstop(anonymized, settings, cid)
    if blocked is not None:
        gateway.finalize(session.conversation_id, "blocked")
        return blocked

    if is_stream:
        logger.info("conv=%s streaming", cid)
        resp = await _stream(request, upstream, session, anonymized, cid, forward_path, make_streamer)
        attach_risk(resp, gate.header)
        gateway.finalize(session.conversation_id, "ok")
        return resp

    resp = await upstream.forward(
        forward_path, request.url.query, forward_headers(request.headers), anonymized
    )
    if resp.status_code >= 400:
        logger.warning("conv=%s upstream error status=%d", cid, resp.status_code)
        try:
            return JSONResponse(resp.json(), status_code=resp.status_code)
        except ValueError:
            media = resp.headers.get("content-type") if hasattr(resp, "headers") else None
            raw = resp.text if hasattr(resp, "text") else resp.content
            return Response(content=raw, status_code=resp.status_code, media_type=media)
    data = resp.json()
    out = JSONResponse(deanonymize(data, session), status_code=resp.status_code)
    attach_risk(out, gate.header)
    gateway.finalize(session.conversation_id, "ok")
    return out


async def _stream(request, upstream, session, anonymized, cid, forward_path, make_streamer):
    query = request.url.query
    headers = forward_headers(request.headers)
    ctx = upstream.stream(forward_path, query, headers, anonymized)
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
        streamer = make_streamer(session.reverse_map())
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
