from privacy_gateway.core.adapters.anthropic_messages import anonymize_request
from privacy_gateway.core.gateway import Gateway
from privacy_gateway.core.vault.store import Vault


def _session(detector):
    return Gateway(detector, Vault()).new_session("c")


def test_system_as_list_of_text_blocks_is_anonymized(detector):
    session = _session(detector)
    payload = {
        "model": "c",
        "max_tokens": 5,
        "system": [{"type": "text", "text": "You assist Alice Johnson in Berlin."}],
        "messages": [{"role": "user", "content": "hello there everyone"}],
    }
    out = anonymize_request(payload, session)
    blob = out["system"][0]["text"]
    assert "Alice Johnson" not in blob
    assert "Berlin" not in blob


def test_tool_use_input_leaves_anonymized_scalars_preserved(detector):
    session = _session(detector)
    payload = {
        "model": "c",
        "max_tokens": 5,
        "messages": [
            {
                "role": "assistant",
                "content": [
                    {
                        "type": "tool_use",
                        "id": "t",
                        "name": "f",
                        "input": {
                            "to": "Alice Johnson",
                            "count": 3,
                            "flag": True,
                            "meta": {"contact": "Bob Stone"},
                        },
                    }
                ],
            }
        ],
    }
    out = anonymize_request(payload, session)
    inp = out["messages"][0]["content"][0]["input"]
    assert "Alice Johnson" not in inp["to"]
    assert "Bob Stone" not in inp["meta"]["contact"]
    assert inp["count"] == 3
    assert inp["flag"] is True
