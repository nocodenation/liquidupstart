import pytest


def types(spans):
    return {s.entity_type for s in spans}


def text_of(spans, text):
    return {text[s.start : s.end] for s in spans}


PER_LANG = [
    ("en", "My name is Alice Johnson and I live in Berlin.", "Alice Johnson"),
    ("de", "Ich heiße Hans Müller und wohne in München.", "Hans Müller"),
    ("fr", "Je m'appelle Marie Dupont et j'habite à Lyon.", "Marie Dupont"),
    ("es", "Me llamo Juan García y vivo en Madrid.", "Juan García"),
    ("it", "Mi chiamo Marco Rossi e vivo a Milano.", "Marco Rossi"),
    ("pt", "Chamo-me João Silva e moro em Lisboa.", "João Silva"),
]


@pytest.mark.parametrize("lang,text,person", PER_LANG)
def test_per_language_person_and_location(detector, lang, text, person):
    spans = detector.detect(text)
    assert "PERSON" in types(spans)
    assert "LOCATION" in types(spans)
    assert person in text_of([s for s in spans if s.entity_type == "PERSON"], text)
    assert all(s.language == lang for s in spans if s.entity_type == "PERSON")


def test_internal_hostname(detector):
    text = "connect to db.acme-prod.internal now please soon"
    spans = detector.detect(text)
    assert "INTERNAL_HOSTNAME" in types(spans)
    assert "db.acme-prod.internal" in text_of(spans, text)


def test_internal_id(detector):
    text = "please check ticket ACME-12345 before the release"
    spans = detector.detect(text)
    assert "INTERNAL_ID" in types(spans)
    assert "ACME-12345" in text_of(spans, text)


def test_internal_id_short_field(detector):
    spans = detector.detect("ACME-12345")
    assert "INTERNAL_ID" in types(spans)


def test_secret_in_text(detector):
    text = 'export AWS_KEY="AKIAIOSFODNN7EXAMPLE" before you deploy'
    spans = detector.detect(text)
    assert "SECRET" in types(spans)
    assert "AKIAIOSFODNN7EXAMPLE" in text_of(spans, text)


def test_secret_in_short_field(detector):
    spans = detector.detect("AKIAIOSFODNN7EXAMPLE")
    assert types(spans) == {"SECRET"}


def test_no_false_secret_on_prose(detector):
    spans = detector.detect("Chamo-me João Silva e moro em Lisboa.")
    assert "SECRET" not in types(spans)
