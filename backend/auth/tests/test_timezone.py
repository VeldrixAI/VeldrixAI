"""Unit tests for timezone validation in the auth service."""
import pytest
from app.core.security import validate_timezone, create_access_token
from jose import jwt
from app.core.config import settings


class TestValidateTimezone:
    def test_valid_iana_timezone(self):
        assert validate_timezone("America/Toronto") == "America/Toronto"

    def test_valid_utc(self):
        assert validate_timezone("UTC") == "UTC"

    def test_valid_europe_london(self):
        assert validate_timezone("Europe/London") == "Europe/London"

    def test_invalid_timezone_falls_back_to_utc(self):
        assert validate_timezone("Not/ATimezone") == "UTC"

    def test_empty_string_falls_back_to_utc(self):
        assert validate_timezone("") == "UTC"

    def test_garbage_falls_back_to_utc(self):
        assert validate_timezone("garbage123") == "UTC"


class TestCreateAccessTokenTzClaim:
    def test_tz_claim_embedded_in_token(self):
        token = create_access_token("user-123", "user", tz="Asia/Tokyo")
        payload = jwt.decode(
            token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM]
        )
        assert payload["tz"] == "Asia/Tokyo"

    def test_tz_defaults_to_utc(self):
        token = create_access_token("user-123", "user")
        payload = jwt.decode(
            token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM]
        )
        assert payload["tz"] == "UTC"
