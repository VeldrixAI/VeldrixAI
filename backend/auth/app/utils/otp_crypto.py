"""
OTP generation for payment authorization.
Encryption delegated to the existing AES-256-GCM vault (VELDRIX_VAULT_KEY).
"""
import secrets
from app.vault import encrypt, decrypt


def generate_otp(length: int = 6) -> str:
    """Cryptographically secure numeric OTP."""
    return "".join(str(secrets.randbelow(10)) for _ in range(length))


def encrypt_otp(otp: str) -> str:
    """Encrypt OTP using the vault's AES-256-GCM key."""
    return encrypt(otp)


def decrypt_otp(encrypted: str) -> str:
    """Decrypt vault-encrypted OTP back to plaintext."""
    return decrypt(encrypted)
