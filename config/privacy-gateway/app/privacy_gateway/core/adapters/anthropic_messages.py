from __future__ import annotations

import json
from copy import deepcopy
from typing import Any, Callable

from privacy_gateway.core.gateway import Session


def _map_leaves(obj: Any, fn: Callable[[str], str]) -> Any:
    if isinstance(obj, str):
        return fn(obj)
    if isinstance(obj, dict):
        return {k: _map_leaves(v, fn) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_map_leaves(v, fn) for v in obj]
    return obj


def anonymize_request(payload: dict, session: Session) -> dict:
    out = deepcopy(payload)
    session.prompt_corpus = json.dumps(payload, ensure_ascii=False)
    _anon_system(out, session)
    for msg in out.get("messages", []):
        if isinstance(msg, dict):
            _anon_content(msg.get("content"), msg, "content", session)
    return out


def _anon_system(out: dict, session: Session) -> None:
    system = out.get("system")
    if isinstance(system, str):
        out["system"] = session.anonymize_text(system)
    elif isinstance(system, list):
        for block in system:
            _anon_block(block, session)


def _anon_content(content: Any, parent: dict, key: str, session: Session) -> None:
    if isinstance(content, str):
        parent[key] = session.anonymize_text(content)
    elif isinstance(content, list):
        for block in content:
            _anon_block(block, session)


def _anon_block(block: Any, session: Session) -> None:
    if not isinstance(block, dict):
        return
    btype = block.get("type")
    if btype == "text" and isinstance(block.get("text"), str):
        block["text"] = session.anonymize_text(block["text"])
    elif btype == "tool_result":
        _anon_content(block.get("content"), block, "content", session)
    elif btype == "tool_use" and isinstance(block.get("input"), (dict, list)):
        block["input"] = _map_leaves(block["input"], session.anonymize_text)


def deanonymize_response(response: dict, session: Session) -> dict:
    out = deepcopy(response)
    for block in out.get("content", []):
        if not isinstance(block, dict):
            continue
        btype = block.get("type")
        if btype == "text" and isinstance(block.get("text"), str):
            block["text"] = session.restore_text(block["text"])
        elif btype == "tool_use" and isinstance(block.get("input"), (dict, list)):
            block["input"] = session.restore_json(block["input"])
    return out
