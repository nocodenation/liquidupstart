from privacy_gateway.config import Settings


def test_blank_vault_ttl_env_is_none(monkeypatch):
    monkeypatch.setenv("PRIVACY_GATEWAY_VAULT_TTL", "")
    assert Settings().vault_ttl is None


def test_numeric_vault_ttl_env_parses(monkeypatch):
    monkeypatch.setenv("PRIVACY_GATEWAY_VAULT_TTL", "3600")
    assert Settings().vault_ttl == 3600.0
