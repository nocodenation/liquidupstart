from __future__ import annotations

import json
from copy import deepcopy
from typing import Any

from privacy_gateway.core.adapters.anthropic_messages import (
    _map_leaves,
    anonymize_tool_defs,
)
from privacy_gateway.core.gateway import Session


def _anon_json_string(raw: str, session: Session) -> str:
    try:
        obj = json.loads(raw)
    except ValueError:
        return session.anonymize_text(raw)
    return json.dumps(_map_leaves(obj, session.anonymize_text), ensure_ascii=False)


def _deanon_json_string(raw: str, session: Session) -> str:
    try:
        obj = json.loads(raw)
    except ValueError:
        return session.restore_text(raw)
    return json.dumps(session.restore_json(obj), ensure_ascii=False)


def _anon_content_parts(content: Any, session: Session) -> None:
    if isinstance(content, list):
        for part in content:
            if isinstance(part, dict) and isinstance(part.get("text"), str):
                part["text"] = session.anonymize_text(part["text"])


def _anon_item(item: Any, session: Session) -> None:
    if not isinstance(item, dict):
        return
    itype = item.get("type")
    if itype == "message":
        _anon_content_parts(item.get("content"), session)
    elif itype == "function_call" and isinstance(item.get("arguments"), str):
        item["arguments"] = _anon_json_string(item["arguments"], session)
    elif itype == "function_call_output" and isinstance(item.get("output"), str):
        item["output"] = session.anonymize_text(item["output"])


def anonymize_request(payload: dict, session: Session) -> dict:
    out = deepcopy(payload)
    session.prompt_corpus = json.dumps(payload, ensure_ascii=False)
    if isinstance(out.get("instructions"), str):
        out["instructions"] = session.anonymize_text(out["instructions"])
    inp = out.get("input")
    if isinstance(inp, str):
        out["input"] = session.anonymize_text(inp)
    elif isinstance(inp, list):
        for item in inp:
            _anon_item(item, session)
    anonymize_tool_defs(out, session)
    return out


def deanonymize_response(response: dict, session: Session) -> dict:
    out = deepcopy(response)
    _deanon_output(out.get("output"), session)
    return out


def _deanon_output(output: Any, session: Session) -> None:
    if not isinstance(output, list):
        return
    for item in output:
        if not isinstance(item, dict):
            continue
        itype = item.get("type")
        if itype == "message":
            for part in item.get("content", []):
                if isinstance(part, dict) and isinstance(part.get("text"), str):
                    part["text"] = session.restore_text(part["text"])
        elif itype == "function_call" and isinstance(item.get("arguments"), str):
            item["arguments"] = _deanon_json_string(item["arguments"], session)
