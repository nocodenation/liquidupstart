import pytest

from privacy_gateway.core.llm.second_pass import SecondPassDetector
from privacy_gateway.core.llm.parse import extract_last_json

from conftest import FakeLocalLLMClient

TEXT = "Our lead engineer relocated from the Reykjavik office to Munich last quarter."


def test_extracts_substring_validated_spans():
    cassette = (
        "Let me think about who this could be.\n"
        '```json\n{"reasoning": "role + relocation narrows identity", '
        '"spans": [{"text": "lead engineer", "type": "ROLE"}, '
        '{"text": "relocated from the Reykjavik office", "type": "QUASI_IDENTIFIER"}]}\n```'
    )
    detector = SecondPassDetector(FakeLocalLLMClient(cassette))
    spans = detector.detect(TEXT)
    found = {TEXT[s.start : s.end] for s in spans}
    assert "lead engineer" in found
    assert "relocated from the Reykjavik office" in found


def test_rejects_hallucinated_non_substring():
    cassette = (
        '```json\n{"reasoning": "x", "spans": ['
        '{"text": "lead engineer", "type": "ROLE"}, '
        '{"text": "Jonathan Abramovich", "type": "PERSON"}]}\n```'
    )
    detector = SecondPassDetector(FakeLocalLLMClient(cassette))
    spans = detector.detect(TEXT)
    found = {TEXT[s.start : s.end] for s in spans}
    assert found == {"lead engineer"}


def test_empty_spans():
    detector = SecondPassDetector(FakeLocalLLMClient('```json\n{"spans": []}\n```'))
    assert detector.detect(TEXT) == []


def test_short_field_skips_llm_call():
    client = FakeLocalLLMClient('{"spans": []}')
    detector = SecondPassDetector(client)
    assert detector.detect("ACME-12345") == []
    assert client.calls == []


def test_parse_last_json_ignores_prose_and_earlier_objects():
    blob = (
        "First I considered {not: valid} json.\n"
        'Then: ```json\n{"a": 1}\n```\nand finally ```json\n{"risk": 0.7}\n```'
    )
    assert extract_last_json(blob) == {"risk": 0.7}


def test_parse_unfenced_raw_object_fallback():
    assert extract_last_json('reasoning here {"a": 1, "b": 2} trailing words') == {
        "a": 1,
        "b": 2,
    }


def test_parse_raises_when_no_json_object():
    with pytest.raises(ValueError):
        extract_last_json("there is no JSON object here at all")
