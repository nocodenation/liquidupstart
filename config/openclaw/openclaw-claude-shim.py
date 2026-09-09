#!/usr/bin/env python3
# Routes OpenClaw's claude-cli session through the privacy gateway instead of
# running Claude Code locally. OpenClaw drives the CLI with `--input-format
# stream-json --output-format stream-json`; this shim reads that conversation,
# forwards it to the gateway's Anthropic Messages endpoint (which anonymizes,
# runs `claude -p`, and de-anonymizes), and re-emits the minimal stream-json
# event sequence OpenClaw parses (system/init -> assistant -> result).
#
# ponytail: conversational only. It carries whatever user turns arrive on stdin;
# Claude Code tools/MCP/permissions and cross-turn CLI session resume are not
# proxied. Upgrade path: map OpenClaw's --session-id to a gateway-side claude
# --resume session if multi-turn context fidelity is needed.
import json
import os
import sys
import urllib.request
import uuid


def _content_text(content):
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(
            b.get("text", "")
            for b in content
            if isinstance(b, dict) and b.get("type") == "text"
        )
    return ""


def _arg(args, name):
    return args[args.index(name) + 1] if name in args and args.index(name) + 1 < len(args) else ""


def _emit(obj):
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()


def _result(sid, text, usage=None, is_error=False):
    _emit({
        "type": "result", "subtype": "error" if is_error else "success",
        "is_error": is_error, "result": text, "session_id": sid, "num_turns": 1,
        "usage": usage or {}, "total_cost_usd": 0, "permission_denials": [],
        "terminal_reason": "completed", "uuid": str(uuid.uuid4()),
    })


def _gateway_call(base, model, messages):
    body = json.dumps({"model": model, "max_tokens": 8192, "messages": messages}).encode()
    req = urllib.request.Request(
        base + "/v1/messages", data=body,
        headers={"content-type": "application/json", "x-api-key": "gateway",
                 "anthropic-version": "2023-06-01"},
    )
    with urllib.request.urlopen(req, timeout=3600) as r:
        return json.loads(r.read())


def main():
    args = sys.argv[1:]
    model = _arg(args, "--model") or os.environ.get("PRIVACY_GATEWAY_CLAUDE_CLI_MODEL", "") \
        or "claude-haiku-4-5-20251001"
    sid = _arg(args, "--session-id") or _arg(args, "--resume") or str(uuid.uuid4())
    base = os.environ["PRIVACY_GATEWAY_ANTHROPIC_URL"].rstrip("/")

    # OpenClaw drives a live bidirectional session: it keeps stdin open and streams
    # user turns in, expecting the session/init event up front and event replies per
    # turn. Emit init immediately, then handle each user message as it arrives (do
    # NOT wait for EOF). Accumulate history so each turn has conversation context.
    _emit({
        "type": "system", "subtype": "init", "cwd": os.getcwd(), "session_id": sid,
        "tools": [], "mcp_servers": [], "model": model,
        "permissionMode": "bypassPermissions", "apiKeySource": "none",
        "slash_commands": [], "output_style": "default", "agents": [], "skills": [],
        "plugins": [], "claude_code_version": "gateway", "uuid": str(uuid.uuid4()),
    })

    history = []
    while True:
        line = sys.stdin.readline()
        if not line:
            break
        line = line.strip()
        if not line:
            continue
        try:
            d = json.loads(line)
        except ValueError:
            continue
        if d.get("type") != "user":
            continue
        text = _content_text((d.get("message") or {}).get("content"))
        if not text:
            continue
        history.append({"role": "user", "content": text})
        try:
            resp = _gateway_call(base, model, history)
        except Exception as exc:  # noqa: BLE001 - surface failure, keep session alive
            _result(sid, f"gateway error: {exc}", is_error=True)
            continue
        reply = "".join(
            b.get("text", "") for b in resp.get("content", []) if b.get("type") == "text"
        )
        usage = resp.get("usage", {})
        history.append({"role": "assistant", "content": reply})
        _emit({
            "type": "assistant",
            "message": {
                "model": model, "id": resp.get("id", "msg_" + uuid.uuid4().hex[:24]),
                "type": "message", "role": "assistant",
                "content": [{"type": "text", "text": reply}],
                "stop_reason": resp.get("stop_reason", "end_turn"), "stop_sequence": None,
                "usage": usage,
            },
            "parent_tool_use_id": None, "session_id": sid, "uuid": str(uuid.uuid4()),
        })
        _result(sid, reply, usage=usage)
    return 0


if __name__ == "__main__":
    sys.exit(main())
