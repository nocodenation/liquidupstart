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


def test_anthropic_tool_definition_description_anonymized(detector):
    session = _session(detector)
    payload = {
        "model": "c", "max_tokens": 5,
        "messages": [{"role": "user", "content": "hello there everyone"}],
        "tools": [{
            "name": "lookup_account",
            "description": "Looks up the account of Hans Mueller (hans.mueller@example.de).",
            "input_schema": {"type": "object", "properties": {
                "note": {"type": "string", "description": "e.g. contact Sabine Vogel in Munich"}}},
        }],
    }
    out = anonymize_request(payload, session)
    tool = out["tools"][0]
    assert tool["name"] == "lookup_account"
    assert "Hans Mueller" not in tool["description"]
    assert "hans.mueller@example.de" not in tool["description"]
    assert "Sabine Vogel" not in tool["input_schema"]["properties"]["note"]["description"]


def test_anthropic_clean_tool_definition_unchanged(detector):
    session = _session(detector)
    desc = "Read a file from the local filesystem and return its contents as text."
    payload = {
        "model": "c", "max_tokens": 5,
        "messages": [{"role": "user", "content": "hello there everyone"}],
        "tools": [{"name": "read_file", "description": desc,
                   "input_schema": {"type": "object", "properties": {
                       "path": {"type": "string", "description": "absolute path to the file"}}}}],
    }
    out = anonymize_request(payload, session)
    assert out["tools"][0]["description"] == desc
    assert out["tools"][0]["input_schema"]["properties"]["path"]["description"] == "absolute path to the file"
