from __future__ import annotations

import json

from conftest import FakeLocalLLMClient
from fastapi.testclient import TestClient

from privacy_gateway.api.app import create_app
from privacy_gateway.config import Settings
from privacy_gateway.core.gateway import Gateway
from privacy_gateway.core.vault.store import Vault


class _Resp:
    def __init__(self, status_code, payload):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        return self._payload


class ResponsesEcho:
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


def _input_text(body):
    parts = []
    inp = body.get("input")
    if isinstance(inp, str):
        return inp
    for item in inp or []:
        if item.get("type") == "message":
            for p in item.get("content", []):
                if p.get("text"):
                    parts.append(p["text"])
    return "".join(parts)


def test_responses_text_round_trip(make_app):
    def responder(body):
        return {"id": "resp_1", "object": "response", "output": [
            {"type": "message", "role": "assistant",
             "content": [{"type": "output_text", "text": f"Reply: {_input_text(body)}"}]}]}

    up = ResponsesEcho(responder)
    client = TestClient(make_app(up))
    body = {
        "model": "gpt-x",
        "instructions": "You help Alice Johnson.",
        "input": [{"type": "message", "role": "user",
                   "content": [{"type": "input_text",
                                "text": "I am Alice Johnson from Berlin, email alice@acme.com"}]}],
    }
    r = client.post("/openai/v1/responses?x=1", json=body, headers={"authorization": "Bearer k"})
    assert r.status_code == 200
    assert up.path == "/v1/responses"
    assert up.query == "x=1"
    sent = json.dumps(up.received)
    assert "Alice Johnson" not in sent
    assert "alice@acme.com" not in sent
    text = r.json()["output"][0]["content"][0]["text"]
    assert "Alice Johnson" in text
    assert "alice@acme.com" in text


def test_responses_function_call_round_trip(make_app):
    def responder(body):
        fc = next(it for it in body["input"] if it.get("type") == "function_call")
        return {"id": "resp", "object": "response", "output": [fc]}

    up = ResponsesEcho(responder)
    client = TestClient(make_app(up))
    body = {
        "model": "gpt-x",
        "input": [
            {"type": "message", "role": "user",
             "content": [{"type": "input_text", "text": "send it"}]},
            {"type": "function_call", "call_id": "c1", "name": "send_email",
             "arguments": json.dumps({"to": "Alice Johnson", "count": 2})},
        ],
    }
    r = client.post("/openai/v1/responses", json=body, headers={"authorization": "Bearer k"})
    assert r.status_code == 200
    assert "Alice Johnson" not in json.dumps(up.received)
    args = r.json()["output"][0]["arguments"]
    assert json.loads(args) == {"to": "Alice Johnson", "count": 2}


def test_responses_gate_blocks_high_risk(detector):
    high_risk = ('```json\n{"reasoning": "VP+Reykjavik near-unique", "attributes": ["VP"], '
                 '"risk": 0.92, "confidence": 0.9}\n```')
    gw = Gateway(detector, Vault(), base_detector=detector,
                 llm_client=FakeLocalLLMClient(high_risk))
    app = create_app(settings=Settings(gate_mode="block"), gateway=gw, upstream=ResponsesEcho(lambda b: {}))
    body = {
        "model": "gpt-x",
        "instructions": "Help the user.",
        "input": [{"type": "message", "role": "user",
                   "content": [{"type": "input_text",
                                "text": "I am Alice Johnson, the VP who relocated from our Reykjavik office."}]}],
    }
    r = TestClient(app).post("/openai/v1/responses", json=body, headers={"authorization": "Bearer x"})
    assert r.status_code == 403
    assert r.json()["error"] == "egress_blocked"
