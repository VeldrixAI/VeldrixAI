"""
VeldrixAI — AES-256-GCM Vault
Provides authenticated encryption for all sensitive at-rest data.

Algorithm : AES-256-GCM (256-bit key, 96-bit nonce, 128-bit auth tag)
Key source : VELDRIX_VAULT_KEY environment variable (base64-encoded 32 bytes)
Encoding  : Encrypted values stored as base64(nonce + ciphertext + tag)
"""

import os
import base64
import secrets
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


_NONCE_BYTES = 12   # 96-bit nonce — GCM standard
_KEY_ENV_VAR = "VELDRIX_VAULT_KEY"


def _load_key() -> bytes:
    """
    Load the 256-bit vault key from the environment.
    Raises a clear RuntimeError on startup if the key is absent or malformed,
    preventing the service from starting without encryption configured.
    """
    raw = os.environ.get(_KEY_ENV_VAR)
    if not raw:
        raise RuntimeError(
            f"[VeldrixAI Vault] {_KEY_ENV_VAR} is not set. "
            "Generate a key with: python -c \"import secrets,base64; "
            "print(base64.b64encode(secrets.token_bytes(32)).decode())\""
        )
    try:
        key = base64.b64decode(raw)
    except Exception:
        raise RuntimeError(
            f"[VeldrixAI Vault] {_KEY_ENV_VAR} is not valid base64."
        )
    if len(key) != 32:
        raise RuntimeError(
            f"[VeldrixAI Vault] {_KEY_ENV_VAR} must decode to exactly 32 bytes "
            f"(got {len(key)}). AES-256 requires a 256-bit key."
        )
    return key


# Load key once at module import time so misconfiguration fails fast.
_KEY: bytes = _load_key()
_AESGCM: AESGCM = AESGCM(_KEY)


def encrypt(plaintext: str) -> str:
    """
    Encrypt a plaintext string with AES-256-GCM.

    Returns a base64-encoded string: nonce (12 bytes) + ciphertext + auth tag (16 bytes).
    The returned value is safe to store in a VARCHAR / TEXT database column.

    Args:
        plaintext: The sensitive string to encrypt (API key, token, secret, etc.)

    Returns:
        Base64-encoded ciphertext envelope.

    Raises:
        ValueError: If plaintext is None or empty.
    """
    if not plaintext:
        raise ValueError("[VeldrixAI Vault] Cannot encrypt None or empty plaintext.")
    nonce = secrets.token_bytes(_NONCE_BYTES)
    ciphertext_with_tag = _AESGCM.encrypt(nonce, plaintext.encode("utf-8"), None)
    envelope = nonce + ciphertext_with_tag
    return base64.b64encode(envelope).decode("utf-8")


def decrypt(ciphertext_b64: str) -> str:
    """
    Decrypt a vault-encrypted value back to plaintext.

    Args:
        ciphertext_b64: The base64-encoded envelope from encrypt().

    Returns:
        The original plaintext string.

    Raises:
        ValueError: If the ciphertext is malformed or authentication fails.
    """
    if not ciphertext_b64:
        raise ValueError("[VeldrixAI Vault] Cannot decrypt None or empty ciphertext.")
    try:
        envelope = base64.b64decode(ciphertext_b64)
        nonce = envelope[:_NONCE_BYTES]
        ciphertext_with_tag = envelope[_NONCE_BYTES:]
        plaintext_bytes = _AESGCM.decrypt(nonce, ciphertext_with_tag, None)
        return plaintext_bytes.decode("utf-8")
    except Exception as exc:
        raise ValueError(
            f"[VeldrixAI Vault] Decryption failed — data may be corrupt or the "
            f"vault key may have changed: {exc}"
        ) from exc


def is_encrypted(value: str) -> bool:
    """
    Heuristic check to detect whether a stored value is already vault-encrypted.
    Used during migration to avoid double-encrypting legacy plaintext values.

    A vault-encrypted value is base64 and decodes to >= 28 bytes (12 nonce + 16 tag).
    This is not a cryptographic guarantee — use only for migration logic.
    """
    if not value:
        return False
    try:
        decoded = base64.b64decode(value)
        return len(decoded) >= (_NONCE_BYTES + 16)
    except Exception:
        return False


def generate_key() -> str:
    """
    Utility: generate a new random 256-bit vault key as base64.
    Print this and set it as VELDRIX_VAULT_KEY in your environment.

    Usage:
        python -c "from app.vault import generate_key; print(generate_key())"
    """
    return base64.b64encode(secrets.token_bytes(32)).decode("utf-8")
