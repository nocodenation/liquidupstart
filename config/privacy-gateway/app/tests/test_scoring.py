from privacy_gateway.core.scoring import (
    adversarial_risk,
    deterministic_floor,
    score_sufficiency,
)

from conftest import FakeLocalLLMClient

ANON = "Contact André Vicente in Lake Joshuabury about the plan."
SURROGATES = {"André Vicente", "Lake Joshuabury"}


def test_floor_clears_when_entities_are_known_surrogates(detector):
    assert deterministic_floor(detector, ANON, SURROGATES) == 0.0


def test_floor_fires_on_residual_entity(detector):
    assert deterministic_floor(detector, ANON, set()) == 1.0


def test_sufficiency_high_when_no_residual_and_no_client(detector):
    s = score_sufficiency(detector, ANON, SURROGATES, client=None)
    assert s.score == 1.0
    assert s.bucket == "low"


def test_sufficiency_low_when_floor_fires(detector):
    s = score_sufficiency(detector, ANON, set(), client=None)
    assert s.score == 0.0
    assert s.bucket == "high"


def test_sufficiency_combines_llm_risk(detector):
    client = FakeLocalLLMClient('```json\n{"risk": 0.9, "confidence": 0.9}\n```')
    s = score_sufficiency(detector, ANON, SURROGATES, client=client)
    assert s.score == round(1.0 - 0.9, 6) or abs(s.score - 0.1) < 1e-9
    assert s.bucket == "high"


def test_adversarial_samples_again_only_on_low_confidence():
    responses = [
        '```json\n{"risk": 0.3, "confidence": 0.2}\n```',
        '```json\n{"risk": 0.8, "confidence": 0.9}\n```',
    ]
    client = FakeLocalLLMClient(responses)
    risk, confidence = adversarial_risk(client, ANON)
    assert len(client.calls) == 2
    assert risk == 0.8
    assert confidence == 0.9


def test_adversarial_stops_on_high_confidence():
    client = FakeLocalLLMClient('```json\n{"risk": 0.2, "confidence": 0.95}\n```')
    risk, confidence = adversarial_risk(client, ANON)
    assert len(client.calls) == 1
    assert risk == 0.2
