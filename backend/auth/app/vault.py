"""
VeldrixAI — AES-256-GCM Vault
Provides authenticated encryption for all sensitive at-rest data.

Algorithm : AES-256-GCM (256-bit key, 96-bit nonce, 128-bit auth tag)
Key source : VELDRIX_VAULT_KEY environment variable (base64-encoded 32 bytes)
Encoding  : Encrypted values stored as base64(nonce + ciphertext + tag)

Key loading is deferred until first use so that import-time side effects
do not affect test environments or services where env vars are injected
after module import (Docker, DigitalOcean App Platform, AWS ECS, etc.).
"""

import hashlib
import hmac as _hmac
import logging
import os
import base64
import secrets
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

_log = logging.getLogger(__name__)

_NONCE_BYTES    = 12    # 96-bit nonce — GCM standard
_KEY_ENV_VAR    = "VELDRIX_VAULT_KEY"
_HASH_KEY_ENV   = "STRIPE_CUSTOMER_HASH_KEY"

# Lazy singletons — initialised on first encrypt/decrypt call, not at import time.
_AESGCM_INSTANCE: AESGCM | None = None
_HMAC_KEY: bytes | None = None


# ── Key loaders ───────────────────────────────────────────────────────────────

def _load_key() -> bytes:
    raw = os.environ.get(_KEY_ENV_VAR)
    if not raw:
        raise RuntimeError(
            f"[VeldrixAI Vault] {_KEY_ENV_VAR} is not set. "
            "Generate: python -c \"import secrets,base64; "
            "print(base64.b64encode(secrets.token_bytes(32)).decode())\""
        )
    try:
        key = base64.b64decode(raw)
    except Exception:
        raise RuntimeError(f"[VeldrixAI Vault] {_KEY_ENV_VAR} is not valid base64.")
    if len(key) != 32:
        raise RuntimeError(
            f"[VeldrixAI Vault] {_KEY_ENV_VAR} must decode to exactly 32 bytes "
            f"(got {len(key)}). AES-256 requires a 256-bit key."
        )
    return key


def _load_hash_key() -> bytes:
    raw = os.environ.get(_HASH_KEY_ENV)
    if not raw:
        _log.warning(
            "[VeldrixAI Vault] %s is not set — using ephemeral HMAC key. "
            "Set a stable value in production. "
            "Generate: python -c \"import secrets,base64; "
            "print(base64.b64encode(secrets.token_bytes(32)).decode())\"",
            _HASH_KEY_ENV,
        )
        return secrets.token_bytes(32)
    try:
        key = base64.b64decode(raw)
    except Exception:
        raise RuntimeError(f"[VeldrixAI Vault] {_HASH_KEY_ENV} is not valid base64.")
    if len(key) < 32:
        raise RuntimeError(
            f"[VeldrixAI Vault] {_HASH_KEY_ENV} must decode to at least 32 bytes "
            f"(got {len(key)})."
        )
    return key


def _get_aesgcm() -> AESGCM:
    global _AESGCM_INSTANCE
    if _AESGCM_INSTANCE is None:
        _AESGCM_INSTANCE = AESGCM(_load_key())
    return _AESGCM_INSTANCE


def _get_hmac_key() -> bytes:
    global _HMAC_KEY
    if _HMAC_KEY is None:
        _HMAC_KEY = _load_hash_key()
    return _HMAC_KEY


# ── Public API ────────────────────────────────────────────────────────────────

def encrypt(plaintext: str) -> str:
    """
    Encrypt a plaintext string with AES-256-GCM.
    Returns base64(nonce[12] + ciphertext + tag[16]) — safe for TEXT columns.
    """
    if not plaintext:
        raise ValueError("[VeldrixAI Vault] Cannot encrypt None or empty plaintext.")
    nonce = secrets.token_bytes(_NONCE_BYTES)
    ct    = _get_aesgcm().encrypt(nonce, plaintext.encode("utf-8"), None)
    return base64.b64encode(nonce + ct).decode("utf-8")


def decrypt(ciphertext_b64: str) -> str:
    """
    Decrypt a vault-encrypted value back to plaintext.
    Raises ValueError if the ciphertext is malformed or the auth tag fails.
    """
    if not ciphertext_b64:
        raise ValueError("[VeldrixAI Vault] Cannot decrypt None or empty ciphertext.")
    try:
        envelope = base64.b64decode(ciphertext_b64)
        nonce    = envelope[:_NONCE_BYTES]
        ct       = envelope[_NONCE_BYTES:]
        return _get_aesgcm().decrypt(nonce, ct, None).decode("utf-8")
    except Exception as exc:
        raise ValueError(
            f"[VeldrixAI Vault] Decryption failed — data may be corrupt or the "
            f"vault key may have changed: {exc}"
        ) from exc


def is_encrypted(value: str) -> bool:
    """
    Heuristic: True when value is base64 and decodes to >= 28 bytes (12 nonce + 16 tag).
    Use only for migration logic — not a cryptographic guarantee.
    """
    if not value:
        return False
    try:
        return len(base64.b64decode(value)) >= (_NONCE_BYTES + 16)
    except Exception:
        return False


def generate_key() -> str:
    """Generate a new random 256-bit vault key as base64. Use for VELDRIX_VAULT_KEY."""
    return base64.b64encode(secrets.token_bytes(32)).decode("utf-8")


def hmac_stripe_customer_id(stripe_customer_id: str) -> str:
    """
    Deterministic HMAC-SHA256 of a Stripe customer ID for indexed lookup.
    Returns a 64-char lowercase hex string (safe for VARCHAR(64)).
    """
    return _hmac.new(
        _get_hmac_key(),
        stripe_customer_id.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
