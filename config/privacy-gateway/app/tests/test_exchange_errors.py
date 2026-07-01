from fastapi.testclient import TestClient

from privacy_gateway.api.app import create_app
from privacy_gateway.config import Settings
from privacy_gateway.core.gateway import Gateway
from privacy_gateway.core.vault.store import Vault


class _NonJsonErrorUpstream:
    def __init__(self, status=401, text="Unauthorized", ct="text/plain"):
        self._status, self._text, self._ct = status, text, ct
        self.headers = {"content-type": ct}
        self.status_code = status
        self.text = text
        self.called = False

    async def forward(self, path, query, headers, json_body):
        self.called = True
        return self

    def json(self):
        raise ValueError("no json")


def test_non_json_upstream_error_passthrough_not_500(detector):
    up = _NonJsonErrorUpstream(status=401, text="Unauthorized")
    app = create_app(
        settings=Settings(enable_grok=True),
        gateway=Gateway(detector, Vault()),
        upstream=up,
    )
    client = TestClient(app)
    r = client.post(
        "/v1/chat/completions",
        json={"model": "grok", "messages": [{"role": "user", "content": "hi there"}]},
        headers={"host": "api.x.ai", "authorization": "Bearer k"},
    )
    assert r.status_code == 401
    assert r.text == "Unauthorized"
