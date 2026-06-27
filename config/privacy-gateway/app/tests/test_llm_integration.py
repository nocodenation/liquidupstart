import os

import pytest

from privacy_gateway.core.llm.client import OpenAICompatClient
from privacy_gateway.core.llm.second_pass import SecondPassDetector
from privacy_gateway.core.scoring import score_sufficiency

pytestmark = pytest.mark.integration

ENABLED = os.environ.get("PRIVACY_GATEWAY_LOCAL_LLM_ENABLE") == "1" and os.environ.get(
    "LOCAL_LLM_API_BASE"
)

skip_unless_live = pytest.mark.skipif(
    not ENABLED, reason="set PRIVACY_GATEWAY_LOCAL_LLM_ENABLE=1 and LOCAL_LLM_API_BASE"
)


def _client():
    return OpenAICompatClient(
        base_url=os.environ["LOCAL_LLM_API_BASE"],
        api_key=os.environ.get("LOCAL_LLM_API_KEY", ""),
        model=os.environ.get("PRIVACY_GATEWAY_LOCAL_LLM_MODEL", ""),
    )


TEXT = "Our 34-year-old lead engineer relocated from the Reykjavik office to Munich."


@skip_unless_live
def test_second_pass_returns_real_substrings():
    spans = SecondPassDetector(_client()).detect(TEXT)
    for s in spans:
        assert TEXT[s.start : s.end] == TEXT[s.start : s.end]
        assert 0 <= s.start < s.end <= len(TEXT)


@skip_unless_live
def test_sufficiency_score_in_range(detector):
    s = score_sufficiency(detector, TEXT, set(), client=_client())
    assert 0.0 <= s.score <= 1.0
    assert s.bucket in {"low", "medium", "high"}
