from privacy_gateway.config import Settings
from privacy_gateway.core.mitm.dispatch import _resolve


def test_mitm_active_from_enabled_backends():
    assert Settings().mitm_active is False
    assert Settings(enable_grok=True).mitm_active is True
    assert Settings(enable_copilot=True).mitm_active is True
    assert Settings(enable_codex=True).mitm_active is True


def test_mode_b_dispatch_gated_on_enable_flag():
    only_grok = Settings(enable_grok=True)
    assert _resolve(only_grok, "api.x.ai").enable_attr == "enable_grok"
    assert _resolve(only_grok, "chatgpt.com") is None
    assert _resolve(only_grok, "api.githubcopilot.com") is None

    only_codex = Settings(enable_codex=True)
    assert _resolve(only_codex, "chatgpt.com").enable_attr == "enable_codex"
    assert _resolve(only_codex, "api.x.ai") is None

    assert _resolve(Settings(), "api.x.ai") is None


def test_enable_flags_read_root_env_aliases(monkeypatch):
    monkeypatch.setenv("ENABLE_GITHUB_COPILOT", "1")
    monkeypatch.setenv("ENABLE_XAI_GROK", "0")
    s = Settings()
    assert s.enable_copilot is True
    assert s.enable_grok is False
    assert s.mitm_active is True
