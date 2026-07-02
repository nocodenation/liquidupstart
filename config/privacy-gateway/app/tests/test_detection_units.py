from privacy_gateway.core.detection.detector import merge_spans
from privacy_gateway.core.detection.language import is_short_or_structured
from privacy_gateway.core.models import Span


def test_is_short_or_structured():
    assert is_short_or_structured("short")
    assert is_short_or_structured("ACME-12345")
    assert is_short_or_structured("12:34:56")
    assert not is_short_or_structured("My name is Alice Johnson and I live in Berlin.")


def test_merge_keeps_non_overlapping():
    spans = [Span(0, 5, "PERSON", 0.85), Span(10, 16, "LOCATION", 0.85)]
    merged = merge_spans(spans)
    assert [s.entity_type for s in merged] == ["PERSON", "LOCATION"]


def test_merge_drops_overlap_lower_priority():
    spans = [Span(0, 10, "PERSON", 0.9), Span(2, 8, "SECRET", 0.9)]
    merged = merge_spans(spans)
    assert len(merged) == 1
    assert merged[0].entity_type == "SECRET"


def test_merge_prefers_longer_at_same_priority():
    spans = [Span(0, 5, "PERSON", 0.85), Span(0, 9, "PERSON", 0.85)]
    merged = merge_spans(spans)
    assert len(merged) == 1
    assert merged[0].end == 9


def test_merge_sorted_by_position():
    spans = [Span(20, 25, "LOCATION", 0.8), Span(0, 5, "PERSON", 0.8)]
    merged = merge_spans(spans)
    assert [s.start for s in merged] == [0, 20]
