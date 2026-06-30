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
