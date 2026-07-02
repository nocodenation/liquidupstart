from __future__ import annotations

import json
from copy import deepcopy
from typing import Any

from privacy_gateway.core.adapters.anthropic_messages import (
    _map_leaves,
    anonymize_tool_defs,
)
from privacy_gateway.core.gateway import Session


def anonymize_request(payload: dict, session: Session) -> dict:
    out = deepcopy(payload)
    session.prompt_corpus = json.dumps(payload, ensure_ascii=False)
    for msg in out.get("messages", []):
        if not isinstance(msg, dict):
            continue
        if "content" in msg:
            msg["content"] = _anon_content(msg.get("content"), session)
        for tc in msg.get("tool_calls") or []:
            _anon_tool_call(tc, session)
    anonymize_tool_defs(out, session)
    return out


def _anon_content(content: Any, session: Session) -> Any:
    if isinstance(content, str):
        return session.anonymize_text(content)
    if isinstance(content, list):
        for part in content:
            if isinstance(part, dict) and part.get("type") == "text" and isinstance(part.get("text"), str):
                part["text"] = session.anonymize_text(part["text"])
        return content
    return content


def _anon_tool_call(tc: Any, session: Session) -> None:
    if not isinstance(tc, dict):
        return
    fn = tc.get("function")
    if isinstance(fn, dict) and isinstance(fn.get("arguments"), str):
        fn["arguments"] = _anon_json_string(fn["arguments"], session)


def _anon_json_string(raw: str, session: Session) -> str:
    try:
        obj = json.loads(raw)
    except ValueError:
        return session.anonymize_text(raw)
    return json.dumps(_map_leaves(obj, session.anonymize_text), ensure_ascii=False)


def deanonymize_response(response: dict, session: Session) -> dict:
    out = deepcopy(response)
    for choice in out.get("choices", []):
        if not isinstance(choice, dict):
            continue
        msg = choice.get("message")
        if not isinstance(msg, dict):
            continue
        if isinstance(msg.get("content"), str):
            msg["content"] = session.restore_text(msg["content"])
        elif isinstance(msg.get("content"), list):
            for part in msg["content"]:
                if isinstance(part, dict) and isinstance(part.get("text"), str):
                    part["text"] = session.restore_text(part["text"])
        if isinstance(msg.get("reasoning_content"), str):
            msg["reasoning_content"] = session.restore_text(msg["reasoning_content"])
        for tc in msg.get("tool_calls") or []:
            _deanon_tool_call(tc, session)
    return out


def _deanon_tool_call(tc: Any, session: Session) -> None:
    if not isinstance(tc, dict):
        return
    fn = tc.get("function")
    if isinstance(fn, dict) and isinstance(fn.get("arguments"), str):
        fn["arguments"] = _deanon_json_string(fn["arguments"], session)


def _deanon_json_string(raw: str, session: Session) -> str:
    try:
        obj = json.loads(raw)
    except ValueError:
        return session.restore_text(raw)
    return json.dumps(session.restore_json(obj), ensure_ascii=False)
