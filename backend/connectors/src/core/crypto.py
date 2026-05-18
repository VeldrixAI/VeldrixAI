"""
Connector credential encryption using Fernet (AES-128-CBC + HMAC-SHA256).

Key source: CONNECTOR_ENCRYPTION_KEY environment variable (URL-safe base64 Fernet key).
Generate a key with:
    python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

Usage:
    from src.core.crypto import encrypt_secret, decrypt_secret

    stored_value = encrypt_secret(raw_api_key)
    raw_api_key  = decrypt_secret(stored_value)
"""

from __future__ import annotations

import os
from cryptography.fernet import Fernet, InvalidToken

_KEY_ENV_VAR = "CONNECTOR_ENCRYPTION_KEY"
_fernet: Fernet | None = None


def _get_fernet() -> Fernet:
    global _fernet
    if _fernet is not None:
        return _fernet

    raw = os.environ.get(_KEY_ENV_VAR)
    if not raw:
        raise RuntimeError(
            f"[VeldrixAI] {_KEY_ENV_VAR} is not set. "
            "Generate a key with: python -c \"from cryptography.fernet import Fernet; "
            "print(Fernet.generate_key().decode())\""
        )
    try:
        _fernet = Fernet(raw.encode())
    except Exception as exc:
        raise RuntimeError(
            f"[VeldrixAI] {_KEY_ENV_VAR} is not a valid Fernet key: {exc}"
        ) from exc
    return _fernet


def encrypt_secret(value: str) -> str:
    """Encrypt a plaintext secret. Returns a URL-safe base64 token."""
    return _get_fernet().encrypt(value.encode()).decode()


def decrypt_secret(token: str) -> str:
    """Decrypt a token produced by encrypt_secret. Raises ValueError on tampered data."""
    try:
        return _get_fernet().decrypt(token.encode()).decode()
    except InvalidToken as exc:
        raise ValueError("Connector secret decryption failed — token is invalid or tampered with wrong format") from exc
