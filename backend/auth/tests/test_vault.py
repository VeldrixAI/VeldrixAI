"""Unit tests for the VeldrixAI AES-256-GCM vault module."""
import os
import base64
import secrets
import pytest

# Set a test key before importing vault so _load_key() succeeds
os.environ["VELDRIX_VAULT_KEY"] = base64.b64encode(secrets.token_bytes(32)).decode()

from app.vault import encrypt, decrypt, is_encrypted, generate_key


class TestVaultEncryptDecrypt:
    def test_round_trip(self):
        plain = "sk-test-api-key-abc123"
        assert decrypt(encrypt(plain)) == plain

    def test_ciphertext_differs_from_plaintext(self):
        plain = "my-secret-token"
        assert encrypt(plain) != plain

    def test_unique_ciphertexts_same_input(self):
        """Each encryption must produce a unique ciphertext (fresh nonce)."""
        plain = "same-input"
        assert encrypt(plain) != encrypt(plain)

    def test_empty_plaintext_raises(self):
        with pytest.raises(ValueError):
            encrypt("")

    def test_none_plaintext_raises(self):
        with pytest.raises(ValueError):
            encrypt(None)

    def test_tampered_ciphertext_raises(self):
        ct = encrypt("sensitive")
        tampered = ct[:-4] + "XXXX"
        with pytest.raises(ValueError):
            decrypt(tampered)

    def test_is_encrypted_positive(self):
        assert is_encrypted(encrypt("test-value")) is True

    def test_is_encrypted_negative(self):
        assert is_encrypted("plaintext-api-key") is False

    def test_generate_key_length(self):
        key = generate_key()
        assert len(base64.b64decode(key)) == 32

    def test_stripe_customer_id_round_trip(self):
        """Simulate encrypting and decrypting a real Stripe customer ID format."""
        customer_id = "cus_Nq1HXLqkdx9OHd"
        assert decrypt(encrypt(customer_id)) == customer_id

    def test_subscription_id_round_trip(self):
        """Simulate encrypting and decrypting a real Stripe subscription ID format."""
        sub_id = "sub_1OuGj2LqkdxOHd9Pl3PQRS"
        assert decrypt(encrypt(sub_id)) == sub_id

    def test_empty_ciphertext_raises(self):
        with pytest.raises(ValueError):
            decrypt("")

    def test_none_ciphertext_raises(self):
        with pytest.raises(ValueError):
            decrypt(None)
