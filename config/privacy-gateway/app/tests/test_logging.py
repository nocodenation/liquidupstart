import logging

from fastapi.testclient import TestClient

from privacy_gateway.logging_config import LOGGER_NAME, configure_logging


class ListHandler(logging.Handler):
    def __init__(self):
        super().__init__()
        self.lines = []

    def emit(self, record):
        self.lines.append(self.format(record))


class FakeResponse:
    def __init__(self, status_code, payload):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        return self._payload


class EchoUpstream:
    def __init__(self):
        self.received = None

    async def forward(self, path, query, headers, json_body):
        self.received = json_body
        user = json_body["messages"][0]["content"]
        return FakeResponse(
            200,
            {
                "id": "m",
                "type": "message",
                "role": "assistant",
                "content": [{"type": "text", "text": f"Noted: {user}"}],
            },
        )


def test_configure_logging_is_idempotent():
    configure_logging("INFO")
    configure_logging("DEBUG")
    logger = logging.getLogger(LOGGER_NAME)
    pg_handlers = [h for h in logger.handlers if getattr(h, "_pg_handler", False)]
    assert len(pg_handlers) == 1
    assert logger.level == logging.DEBUG


def test_logs_never_contain_pii(make_app):
    up = EchoUpstream()
    app = make_app(up)

    logger = logging.getLogger(LOGGER_NAME)
    handler = ListHandler()
    handler.setFormatter(logging.Formatter("%(name)s %(message)s"))
    logger.setLevel(logging.DEBUG)
    logger.addHandler(handler)
    try:
        client = TestClient(app)
        r = client.post(
            "/anthropic/v1/messages",
            json={
                "model": "c",
                "max_tokens": 10,
                "messages": [
                    {
                        "role": "user",
                        "content": "My name is Alice Johnson, email alice.johnson@example.com, in Berlin.",
                    }
                ],
            },
        )
    finally:
        logger.removeHandler(handler)

    assert r.status_code == 200
    blob = "\n".join(handler.lines)

    for original in ("Alice Johnson", "alice.johnson@example.com", "Berlin"):
        assert original not in blob, f"PII leaked into logs: {original!r}"

    sent = up.received["messages"][0]["content"]
    assert sent not in blob

    assert any("anonymize" in line for line in handler.lines)
    assert "PERSON" in blob
