import httpx
import pytest

from privacy_gateway.core.errors import LLMUnavailable
from privacy_gateway.core.llm.client import OpenAICompatClient


def _completion(content):
    return httpx.Response(200, json={"choices": [{"message": {"content": content}}]})


def test_chat_returns_message_content():
    def handler(request):
        return _completion("hello")

    client = OpenAICompatClient(
        "http://local", model="m", transport=httpx.MockTransport(handler)
    )
    assert client.chat([{"role": "user", "content": "x"}]) == "hello"


def test_chat_sends_bearer_and_correct_url():
    seen = {}

    def handler(request):
        seen["url"] = str(request.url)
        seen["auth"] = request.headers.get("authorization")
        return _completion("ok")

    client = OpenAICompatClient(
        "http://local", api_key="secret", transport=httpx.MockTransport(handler)
    )
    client.chat([{"role": "user", "content": "x"}])
    assert seen["url"] == "http://local/v1/chat/completions"
    assert seen["auth"] == "Bearer secret"


def test_base_url_with_v1_is_not_doubled():
    seen = {}

    def handler(request):
        seen["url"] = str(request.url)
        return _completion("ok")

    client = OpenAICompatClient(
        "http://local/v1", transport=httpx.MockTransport(handler)
    )
    client.chat([{"role": "user", "content": "x"}])
    assert seen["url"] == "http://local/v1/chat/completions"


def test_no_bearer_header_when_api_key_absent():
    seen = {}

    def handler(request):
        seen["auth"] = request.headers.get("authorization")
        return _completion("ok")

    client = OpenAICompatClient("http://local", transport=httpx.MockTransport(handler))
    client.chat([{"role": "user", "content": "x"}])
    assert seen["auth"] is None


def test_retries_then_raises_llm_unavailable():
    calls = {"n": 0}

    def handler(request):
        calls["n"] += 1
        return httpx.Response(500, json={"error": "boom"})

    client = OpenAICompatClient(
        "http://local", retries=1, transport=httpx.MockTransport(handler)
    )
    with pytest.raises(LLMUnavailable):
        client.chat([{"role": "user", "content": "x"}])
    assert calls["n"] == 2
