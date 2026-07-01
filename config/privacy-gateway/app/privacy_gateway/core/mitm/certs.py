from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID

VENDOR_HOSTS = ("api.x.ai", "api.githubcopilot.com", "chatgpt.com")


@dataclass(frozen=True)
class CaPaths:
    ca_cert: Path
    ca_key: Path
    leaf_cert: Path
    leaf_key: Path


def _write(path: Path, data: bytes, mode: int) -> None:
    path.write_bytes(data)
    os.chmod(path, mode)


def ensure_ca(ca_dir: str | Path) -> CaPaths:
    ca_dir = Path(ca_dir)
    paths = CaPaths(
        ca_dir / "ca.crt", ca_dir / "ca.key", ca_dir / "leaf.crt", ca_dir / "leaf.key"
    )
    if all(p.exists() for p in (paths.ca_cert, paths.ca_key, paths.leaf_cert, paths.leaf_key)):
        return paths
    ca_dir.mkdir(parents=True, exist_ok=True)

    not_before = datetime(2020, 1, 1, tzinfo=timezone.utc)
    not_after = datetime.now(timezone.utc) + timedelta(days=3650)

    ca_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    ca_name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "privacy-gateway local CA")])
    ca_cert = (
        x509.CertificateBuilder()
        .subject_name(ca_name)
        .issuer_name(ca_name)
        .public_key(ca_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(not_before)
        .not_valid_after(not_after)
        .add_extension(x509.BasicConstraints(ca=True, path_length=0), critical=True)
        .add_extension(
            x509.KeyUsage(
                digital_signature=True, key_cert_sign=True, crl_sign=True,
                key_encipherment=False, content_commitment=False, data_encipherment=False,
                key_agreement=False, encipher_only=False, decipher_only=False,
            ),
            critical=True,
        )
        .sign(ca_key, hashes.SHA256())
    )

    leaf_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    leaf_cert = (
        x509.CertificateBuilder()
        .subject_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, VENDOR_HOSTS[0])]))
        .issuer_name(ca_name)
        .public_key(leaf_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(not_before)
        .not_valid_after(not_after)
        .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
        .add_extension(
            x509.SubjectAlternativeName([x509.DNSName(h) for h in VENDOR_HOSTS]),
            critical=False,
        )
        .add_extension(
            x509.ExtendedKeyUsage([x509.oid.ExtendedKeyUsageOID.SERVER_AUTH]), critical=False
        )
        .sign(ca_key, hashes.SHA256())
    )

    key_enc = serialization.Encoding.PEM
    key_fmt = serialization.PrivateFormat.TraditionalOpenSSL
    no_enc = serialization.NoEncryption()
    _write(paths.ca_cert, ca_cert.public_bytes(serialization.Encoding.PEM), 0o644)
    _write(paths.ca_key, ca_key.private_bytes(key_enc, key_fmt, no_enc), 0o600)
    _write(paths.leaf_cert, leaf_cert.public_bytes(serialization.Encoding.PEM), 0o644)
    _write(paths.leaf_key, leaf_key.private_bytes(key_enc, key_fmt, no_enc), 0o600)
    return paths
