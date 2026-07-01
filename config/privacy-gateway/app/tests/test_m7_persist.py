import pytest

from privacy_gateway.core.vault.persist import load, load_or_create_key, save
from privacy_gateway.core.vault.store import Vault


def _seed():
    v = Vault()
    v.mint("PERSON", "Alice Johnson", "convA")
    v.mint("SECRET", "AKIAIOSFODNN7EXAMPLE", "convA")
    v.mint("PERSON", "Bob Stone", "convB")
    return v


def test_vault_persist_round_trip(tmp_path):
    key = load_or_create_key(tmp_path / "vault.key")
    src = _seed()
    path = tmp_path / "vault.enc"
    save(src, path, key)

    restored = load(path, key)
    assert restored.reverse_map("convA") == src.reverse_map("convA")
    assert restored.reverse_map("convB") == src.reverse_map("convB")
    assert "Alice Johnson" in restored.reverse_map("convA").values()
    assert restored.reverse_map("convA") != restored.reverse_map("convB")


def test_vault_persist_aes_gcm_tamper_detected(tmp_path):
    key = load_or_create_key(tmp_path / "vault.key")
    path = tmp_path / "vault.enc"
    save(_seed(), path, key)

    raw = bytearray(path.read_bytes())
    raw[-1] ^= 0xFF
    path.write_bytes(bytes(raw))

    with pytest.raises(Exception):
        load(path, key)


def test_vault_persist_drops_expired_on_load(tmp_path):
    key = load_or_create_key(tmp_path / "vault.key")
    clock = {"t": 1000.0}
    src = Vault(clock=lambda: clock["t"])
    src.mint("PERSON", "Alice Johnson", "c")
    path = tmp_path / "vault.enc"
    save(src, path, key)

    clock["t"] = 1300.0
    restored = load(path, key, clock=lambda: clock["t"], ttl_seconds=100)
    assert restored.reverse_map("c") == {}
    assert restored.entries("c") == []
