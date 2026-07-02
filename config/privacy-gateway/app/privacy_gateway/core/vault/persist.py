from __future__ import annotations

import json
import os
from dataclasses import asdict
from pathlib import Path
from time import time as _time
from typing import Callable

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from .store import Vault, VaultEntry


def load_or_create_key(path: str | Path) -> bytes:
    path = Path(path)
    if path.exists():
        return path.read_bytes()
    key = AESGCM.generate_key(bit_length=256)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(key)
    os.chmod(path, 0o600)
    return key


def save(vault: Vault, path: str | Path, key: bytes) -> None:
    entries = [asdict(e) for es in vault._conv_entries.values() for e in es]
    plaintext = json.dumps(entries).encode()
    nonce = os.urandom(12)
    blob = nonce + AESGCM(key).encrypt(nonce, plaintext, None)
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_bytes(blob)
    os.replace(tmp, path)


def load(
    path: str | Path,
    key: bytes,
    clock: Callable[[], float] = _time,
    ttl_seconds: float | None = None,
) -> Vault:
    vault = Vault(clock=clock, ttl_seconds=ttl_seconds)
    path = Path(path)
    if not path.exists():
        return vault
    blob = path.read_bytes()
    plaintext = AESGCM(key).decrypt(blob[:12], blob[12:], None)
    now = clock()
    for d in json.loads(plaintext):
        entry = VaultEntry(**d)
        if ttl_seconds is not None and now - entry.created_at > ttl_seconds:
            continue
        if entry.transform_type == "surrogate":
            vault._fwd[(entry.entity_type, entry.original)] = entry
        vault._register(entry, entry.conversation_id)
    return vault
