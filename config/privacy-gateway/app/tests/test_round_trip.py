import json

from fastapi.testclient import TestClient


class FakeResponse:
    def __init__(self, status_code, payload):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        return self._payload


class EchoUpstream:
    def __init__(self, responder):
        self.responder = responder
        self.received = None
        self.query = None

    async def forward(self, path, query, headers, json_body):
        self.received = json_body
        self.query = query
        return FakeResponse(200, self.responder(json_body))


def test_text_round_trip(make_app):
    def responder(body):
        user = body["messages"][0]["content"]
        return {
            "id": "msg_1",
            "type": "message",
            "role": "assistant",
            "model": body["model"],
            "content": [{"type": "text", "text": f"I will email {user}"}],
        }

    up = EchoUpstream(responder)
    client = TestClient(make_app(up))
    body = {
        "model": "claude-x",
        "max_tokens": 1024,
        "system": "You assist Alice Johnson.",
        "messages": [
            {
                "role": "user",
                "content": "My name is Alice Johnson and my email is alice@acme.com",
            }
        ],
    }
    r = client.post(
        "/anthropic/v1/messages?beta=true", json=body, headers={"authorization": "Bearer x"}
    )
    assert r.status_code == 200

    sent = json.dumps(up.received)
    assert "Alice Johnson" not in sent
    assert "alice@acme.com" not in sent
    assert up.query == "beta=true"
    assert up.received["model"] == "claude-x"
    assert up.received["max_tokens"] == 1024

    text = r.json()["content"][0]["text"]
    assert "Alice Johnson" in text
    assert "alice@acme.com" in text


def test_tool_use_round_trip(make_app):
    def responder(body):
        user = body["messages"][0]["content"]
        return {
            "id": "m",
            "type": "message",
            "role": "assistant",
            "content": [
                {
                    "type": "tool_use",
                    "id": "tu_1",
                    "name": "send_email",
                    "input": {"to": user, "count": 3},
                }
            ],
        }

    up = EchoUpstream(responder)
    client = TestClient(make_app(up))
    body = {
        "model": "c",
        "max_tokens": 10,
        "messages": [{"role": "user", "content": "Contact Alice Johnson in Berlin"}],
    }
    r = client.post("/anthropic/v1/messages", json=body)
    inp = r.json()["content"][0]["input"]
    assert "Alice Johnson" in inp["to"]
    assert "Berlin" in inp["to"]
    assert inp["count"] == 3


def test_tool_result_inbound_anonymized(make_app):
    def responder(body):
        return {
            "id": "m",
            "type": "message",
            "role": "assistant",
            "content": [{"type": "text", "text": "ok"}],
        }

    up = EchoUpstream(responder)
    client = TestClient(make_app(up))
    body = {
        "model": "c",
        "max_tokens": 5,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "summarize the result"},
                    {
                        "type": "tool_result",
                        "tool_use_id": "t1",
                        "content": [
                            {
                                "type": "text",
                                "text": "Reached Alice Johnson at alice@acme.com",
                            }
                        ],
                    },
                ],
            }
        ],
    }
    client.post("/anthropic/v1/messages", json=body)
    sent = json.dumps(up.received)
    assert "Alice Johnson" not in sent
    assert "alice@acme.com" not in sent


def test_head_preflight(make_app):
    client = TestClient(make_app(EchoUpstream(lambda b: {})))
    assert client.head("/").status_code == 200
    assert client.head("/anthropic").status_code == 200
