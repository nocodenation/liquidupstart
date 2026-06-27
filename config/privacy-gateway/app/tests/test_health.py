from fastapi.testclient import TestClient

from privacy_gateway.api.app import create_app


def test_healthz():
    client = TestClient(create_app())
    resp = client.get("/healthz")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}
