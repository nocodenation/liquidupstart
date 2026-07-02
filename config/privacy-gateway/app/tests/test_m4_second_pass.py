from __future__ import annotations

from conftest import FakeLocalLLMClient

from privacy_gateway.api.deps import build_detector
from privacy_gateway.config import Settings
from privacy_gateway.core.detection.detector import CompositeDetector
from privacy_gateway.core.gateway import Gateway
from privacy_gateway.core.vault.store import Vault

CASSETTE = (
    '```json\n{"reasoning": "internal project name narrows identity", '
    '"spans": [{"text": "Bluefin initiative", "type": "QUASI_IDENTIFIER"}]}\n```'
)
TEXT = "Our colleague joined the Bluefin initiative last spring."


def test_second_pass_wired_into_anonymization(detector):
    client = FakeLocalLLMClient(CASSETTE)
    settings = Settings(local_llm_enable=True)
    composite = build_detector(settings, detector, client)
    assert isinstance(composite, CompositeDetector)

    gw = Gateway(composite, Vault(), base_detector=detector, llm_client=client)
    session = gw.new_session("c1")
    out = session.anonymize_text(TEXT)

    assert "Bluefin initiative" not in out
    assert client.calls  # the second-pass LLM was actually consulted


def test_second_pass_disabled_no_llm_call(detector):
    client = FakeLocalLLMClient(CASSETTE)
    settings = Settings(local_llm_enable=False)
    det = build_detector(settings, detector, client)
    assert det is detector  # no composite when disabled

    gw = Gateway(det, Vault())
    session = gw.new_session("c2")
    session.anonymize_text(TEXT)

    assert client.calls == []  # LLM never invoked when disabled


def test_second_pass_garbage_output_raises_llm_unavailable():
    import pytest

    from privacy_gateway.core.errors import LLMUnavailable
    from privacy_gateway.core.llm.second_pass import SecondPassDetector

    client = FakeLocalLLMClient("thinking aloud with no json at all")
    det = SecondPassDetector(client)
    with pytest.raises(LLMUnavailable):
        det.detect("Our colleague joined the Bluefin initiative last spring in Hamburg.")


def test_route_returns_502_when_second_pass_unavailable(detector):
    from fastapi.testclient import TestClient

    from privacy_gateway.api.app import create_app
    from privacy_gateway.core.llm.second_pass import SecondPassDetector

    client = FakeLocalLLMClient("garbage no json")
    composite = CompositeDetector(detector, SecondPassDetector(client))
    app = create_app(
        gateway=Gateway(composite, Vault(), base_detector=detector, llm_client=client),
        upstream=object(),
    )
    tc = TestClient(app, raise_server_exceptions=False)
    r = tc.post(
        "/openai/v1/chat/completions",
        json={"model": "m", "messages": [{"role": "user",
              "content": "Our colleague joined the Bluefin initiative last spring in Hamburg."}]},
        headers={"authorization": "Bearer k"},
    )
    assert r.status_code == 502
