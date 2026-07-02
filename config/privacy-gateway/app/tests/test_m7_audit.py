import json

from privacy_gateway.core.audit import AuditLog
from privacy_gateway.core.vault.store import Vault


def _entries():
    v = Vault()
    v.mint("PERSON", "Alice Johnson", "c")
    v.mint("PERSON", "Bob Stone", "c")
    v.mint("SECRET", "AKIAIOSFODNN7EXAMPLE", "c")
    return v, v.entries("c")


def test_audit_records_types_not_values(tmp_path):
    path = tmp_path / "audit.jsonl"
    v, entries = _entries()
    AuditLog(path, clock=lambda: 1000.0).record("conversationXYZ", entries, backstop="ok")

    raw = path.read_text()
    rec = json.loads(raw.strip())
    assert rec["types"] == {"PERSON": 2, "SECRET": 1}
    assert rec["conv"] == "conversa"
    assert rec["backstop"] == "ok"
    assert "Alice Johnson" not in raw
    assert "AKIAIOSFODNN7EXAMPLE" not in raw
    for e in entries:
        assert e.replacement not in raw


def test_audit_append_only(tmp_path):
    path = tmp_path / "audit.jsonl"
    v, entries = _entries()
    log = AuditLog(path, clock=lambda: 1.0)
    log.record("c1", entries)
    log.record("c2", entries)
    assert len([ln for ln in path.read_text().splitlines() if ln.strip()]) == 2


def test_audit_disabled_writes_nothing(tmp_path):
    path = tmp_path / "audit.jsonl"
    v, entries = _entries()
    AuditLog(path, enabled=False).record("c", entries)
    assert not path.exists()
