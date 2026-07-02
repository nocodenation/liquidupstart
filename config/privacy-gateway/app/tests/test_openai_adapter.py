from __future__ import annotations

import json

from fastapi.testclient import TestClient

from privacy_gateway.config import Settings
from privacy_gateway.api.routes.openai import provider_upstream


class _Resp:
    def __init__(self, status_code, payload):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        return self._payload


class OpenAIEcho:
    def __init__(self, responder):
        self.responder = responder
        self.received = None
        self.path = None
        self.query = None

    async def forward(self, path, query, headers, json_body):
        self.received = json_body
        self.path = path
        self.query = query
        return _Resp(200, self.responder(json_body))


def test_openai_provider_routing():
    s = Settings(openai_upstream="https://api.openai.com", xai_upstream="https://api.x.ai")
    assert provider_upstream(s, "openai") == "https://api.openai.com"
    assert provider_upstream(s, "xai") == "https://api.x.ai"
    assert provider_upstream(s, "bogus") is None


def test_openai_text_round_trip(make_app):
    def responder(body):
        user = body["messages"][-1]["content"]
        return {
            "id": "c", "object": "chat.completion",
            "choices": [{"index": 0, "finish_reason": "stop",
                         "message": {"role": "assistant", "content": f"Reply: {user}"}}],
        }

    up = OpenAIEcho(responder)
    client = TestClient(make_app(up))
    body = {
        "model": "gpt-x",
        "messages": [
            {"role": "system", "content": "You help Alice Johnson."},
            {"role": "user", "content": "I am Alice Johnson from Berlin, email alice@acme.com"},
        ],
    }
    r = client.post("/openai/v1/chat/completions?x=1", json=body,
                    headers={"authorization": "Bearer k"})
    assert r.status_code == 200
    assert up.path == "/v1/chat/completions"
    assert up.query == "x=1"
    sent = json.dumps(up.received)
    assert "Alice Johnson" not in sent
    assert "alice@acme.com" not in sent
    text = r.json()["choices"][0]["message"]["content"]
    assert "Alice Johnson" in text
    assert "alice@acme.com" in text


def test_openai_tool_calls_round_trip(make_app):
    def responder(body):
        tc = body["messages"][1]["tool_calls"]
        return {
            "id": "c",
            "choices": [{"index": 0, "finish_reason": "tool_calls",
                         "message": {"role": "assistant", "content": None, "tool_calls": tc}}],
        }

    up = OpenAIEcho(responder)
    client = TestClient(make_app(up))
    body = {
        "model": "gpt-x",
        "messages": [
            {"role": "user", "content": "send it"},
            {"role": "assistant", "content": None, "tool_calls": [
                {"id": "t1", "type": "function",
                 "function": {"name": "send_email",
                              "arguments": json.dumps({"to": "Alice Johnson", "count": 2})}}]},
            {"role": "user", "content": "thanks"},
        ],
    }
    r = client.post("/openai/v1/chat/completions", json=body,
                    headers={"authorization": "Bearer k"})
    assert r.status_code == 200
    assert "Alice Johnson" not in json.dumps(up.received)

    args = r.json()["choices"][0]["message"]["tool_calls"][0]["function"]["arguments"]
    parsed = json.loads(args)
    assert parsed == {"to": "Alice Johnson", "count": 2}


def test_openai_unknown_provider_404(make_app):
    up = OpenAIEcho(lambda b: {})
    client = TestClient(make_app(up))
    r = client.post("/bogus/v1/chat/completions", json={"model": "m", "messages": []},
                    headers={"authorization": "Bearer k"})
    assert r.status_code == 404


def test_openai_reasoning_content_restored(make_app):
    def responder(body):
        user = body["messages"][-1]["content"]
        return {
            "id": "c", "object": "chat.completion",
            "choices": [{"index": 0, "finish_reason": "stop",
                         "message": {"role": "assistant", "content": f"Reply: {user}",
                                     "reasoning_content": f"Thinking about {user}"}}],
        }

    up = OpenAIEcho(responder)
    client = TestClient(make_app(up))
    body = {
        "model": "gpt-x",
        "messages": [{"role": "user", "content": "I am Alice Johnson from Berlin"}],
    }
    r = client.post("/openai/v1/chat/completions", json=body,
                    headers={"authorization": "Bearer k"})
    assert r.status_code == 200
    msg = r.json()["choices"][0]["message"]
    assert "Alice Johnson" in msg["content"]
    assert "Alice Johnson" in msg["reasoning_content"]


def test_openai_tool_definition_description_anonymized(make_app):
    up = OpenAIEcho(lambda b: {"id": "c", "object": "chat.completion",
        "choices": [{"index": 0, "finish_reason": "stop",
                     "message": {"role": "assistant", "content": "ok"}}]})
    client = TestClient(make_app(up))
    body = {"model": "gpt-x",
        "messages": [{"role": "user", "content": "call the tool please"}],
        "tools": [{"type": "function", "function": {
            "name": "lookup",
            "description": "Look up Hans Mueller at hans.mueller@example.de",
            "parameters": {"type": "object", "properties": {}}}}]}
    r = client.post("/openai/v1/chat/completions", json=body,
                    headers={"authorization": "Bearer k"})
    assert r.status_code == 200
    sent = json.dumps(up.received)
    assert "Hans Mueller" not in sent
    assert "hans.mueller@example.de" not in sent
    assert up.received["tools"][0]["function"]["name"] == "lookup"


def test_openai_clean_tool_definition_unchanged(make_app):
    up = OpenAIEcho(lambda b: {"id": "c", "object": "chat.completion",
        "choices": [{"index": 0, "finish_reason": "stop",
                     "message": {"role": "assistant", "content": "ok"}}]})
    client = TestClient(make_app(up))
    desc = "Execute a shell command and return its standard output."
    body = {"model": "gpt-x",
        "messages": [{"role": "user", "content": "hi there everyone"}],
        "tools": [{"type": "function", "function": {
            "name": "bash", "description": desc,
            "parameters": {"type": "object", "properties": {}}}}]}
    r = client.post("/openai/v1/chat/completions", json=body,
                    headers={"authorization": "Bearer k"})
    assert r.status_code == 200
    assert up.received["tools"][0]["function"]["description"] == desc
