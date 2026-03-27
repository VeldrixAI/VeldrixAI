"""Timezone utilities for audit log stamping."""
from datetime import datetime, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


def validate_timezone(tz: str) -> str:
    """Validate an IANA timezone string. Returns 'UTC' if invalid or absent."""
    try:
        ZoneInfo(tz)
        return tz
    except (ZoneInfoNotFoundError, KeyError):
        return "UTC"


def build_audit_timestamps(user_tz: str = "UTC") -> dict:
    """
    Build the three audit timestamp fields for a log entry.

    Returns a dict with:
        logged_at_utc   — canonical UTC datetime (timezone-aware)
        user_timezone   — validated IANA timezone string
        logged_at_local — ISO 8601 string in the user's local timezone
    """
    safe_tz = validate_timezone(user_tz)
    utc_now = datetime.now(tz=timezone.utc)
    local_str = utc_now.astimezone(ZoneInfo(safe_tz)).isoformat()
    return {
        "logged_at_utc": utc_now,
        "user_timezone": safe_tz,
        "logged_at_local": local_str,
    }
