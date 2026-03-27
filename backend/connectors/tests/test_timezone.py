"""Unit tests for timezone utilities in the connectors service."""
import pytest
from datetime import timezone
from src.utils.timezone import validate_timezone, build_audit_timestamps


class TestValidateTimezone:
    def test_valid_iana_timezone(self):
        assert validate_timezone("America/New_York") == "America/New_York"

    def test_valid_utc(self):
        assert validate_timezone("UTC") == "UTC"

    def test_invalid_falls_back_to_utc(self):
        assert validate_timezone("Fake/Zone") == "UTC"

    def test_empty_string_falls_back_to_utc(self):
        assert validate_timezone("") == "UTC"


class TestBuildAuditTimestamps:
    def test_returns_required_keys(self):
        result = build_audit_timestamps("UTC")
        assert "logged_at_utc" in result
        assert "user_timezone" in result
        assert "logged_at_local" in result

    def test_logged_at_utc_is_timezone_aware(self):
        result = build_audit_timestamps("UTC")
        assert result["logged_at_utc"].tzinfo is not None

    def test_user_timezone_stored_correctly(self):
        result = build_audit_timestamps("Europe/Paris")
        assert result["user_timezone"] == "Europe/Paris"

    def test_logged_at_local_is_iso_string(self):
        result = build_audit_timestamps("America/Chicago")
        # Should be a valid ISO 8601 string
        local = result["logged_at_local"]
        assert isinstance(local, str)
        assert "T" in local  # ISO 8601 separator

    def test_invalid_tz_falls_back_to_utc(self):
        result = build_audit_timestamps("Invalid/Zone")
        assert result["user_timezone"] == "UTC"

    def test_default_arg_is_utc(self):
        result = build_audit_timestamps()
        assert result["user_timezone"] == "UTC"
