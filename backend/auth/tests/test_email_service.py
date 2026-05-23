"""
Unit tests for VeldrixAI EmailService.
Injects a mock resend module into sys.modules — no real API calls made
and no resend package required at test time.
Run from backend/auth/: pytest tests/test_email_service.py -v
"""
import sys
import pytest
from unittest.mock import MagicMock, patch


# ── Helpers ───────────────────────────────────────────────────────────────────

def _make_mock_resend():
    """Return a fresh MagicMock that stands in for the resend package."""
    mock = MagicMock()
    mock.Emails.send.return_value = {"id": "msg_test_001"}
    return mock


def _mock_settings():
    s = MagicMock()
    s.RESEND_API_KEY = "re_test_key_abc123"
    s.EMAIL_FROM_NAME = "VeldrixAI"
    s.EMAIL_FROM = "noreply@veldrixai.ca"
    s.EMAIL_SUPPORT_ADDRESS = "rudramani031@veldrixai.ca"
    s.VELDRIX_UI_URL = "https://app.veldrix.com"
    return s


# ── Fixture ───────────────────────────────────────────────────────────────────

@pytest.fixture
def email_svc():
    with patch("app.services.email_service.settings", _mock_settings()):
        from app.services.email_service import EmailService
        return EmailService()


# ── send_auth_welcome ─────────────────────────────────────────────────────────

def test_send_auth_welcome_success(email_svc):
    mock_resend = _make_mock_resend()
    with patch.dict(sys.modules, {"resend": mock_resend}):
        result = email_svc.send_auth_welcome(
            to_email="user@example.com",
            user_name="Rudra",
        )
    assert result is True
    mock_resend.Emails.send.assert_called_once()
    payload = mock_resend.Emails.send.call_args[0][0]
    assert payload["to"] == ["user@example.com"]
    assert "Welcome to VeldrixAI" in payload["subject"]
    assert "noreply@veldrixai.ca" in payload["from"]


def test_send_auth_welcome_smtp_failure_returns_false(email_svc):
    """Transport errors must return False, never raise."""
    mock_resend = _make_mock_resend()
    mock_resend.Emails.send.side_effect = Exception("Resend API timeout")
    with patch.dict(sys.modules, {"resend": mock_resend}):
        result = email_svc.send_auth_welcome(
            to_email="user@example.com",
            user_name="Rudra",
        )
    assert result is False


def test_send_auth_welcome_no_api_key_returns_false():
    """Missing RESEND_API_KEY must skip silently and return False."""
    s = _mock_settings()
    s.RESEND_API_KEY = ""

    with patch("app.services.email_service.settings", s):
        from app.services.email_service import EmailService
        svc = EmailService()

    mock_resend = _make_mock_resend()
    with patch.dict(sys.modules, {"resend": mock_resend}):
        result = svc.send_auth_welcome("user@example.com", "Rudra")

    assert result is False
    mock_resend.Emails.send.assert_not_called()


# ── send_ticket_confirmation ──────────────────────────────────────────────────

def test_send_ticket_confirmation_success(email_svc):
    mock_resend = _make_mock_resend()
    with patch.dict(sys.modules, {"resend": mock_resend}):
        result = email_svc.send_ticket_confirmation(
            to_email="user@example.com",
            user_name="Rudra",
            ticket_number="VX-SUP-20260523-AB12",
            ticket_subject="API latency issue",
            ticket_body="My API is returning 500ms p99 instead of 200ms.",
            priority="High",
        )
    assert result is True
    payload = mock_resend.Emails.send.call_args[0][0]
    assert "VX-SUP-20260523-AB12" in payload["subject"]
    # Ticket emails must come FROM the support address
    assert "rudramani031@veldrixai.ca" in payload["from"]


def test_send_ticket_confirmation_failure_returns_false(email_svc):
    mock_resend = _make_mock_resend()
    mock_resend.Emails.send.side_effect = Exception("Rate limited")
    with patch.dict(sys.modules, {"resend": mock_resend}):
        result = email_svc.send_ticket_confirmation(
            to_email="user@example.com",
            user_name="Rudra",
            ticket_number="VX-SUP-TEST-0001",
            ticket_subject="Test issue",
            ticket_body="Testing failure handling.",
        )
    assert result is False


# ── send_onboarding_complete ──────────────────────────────────────────────────

def test_send_onboarding_complete_success(email_svc):
    mock_resend = _make_mock_resend()
    with patch.dict(sys.modules, {"resend": mock_resend}):
        result = email_svc.send_onboarding_complete(
            to_email="user@example.com",
            user_name="Rudra",
            plan_name="Growth",
        )
    assert result is True
    payload = mock_resend.Emails.send.call_args[0][0]
    assert payload["to"] == ["user@example.com"]
    assert "live on VeldrixAI" in payload["subject"]


# ── Template rendering ────────────────────────────────────────────────────────

def test_render_injects_brand_context(email_svc):
    """Rendered HTML must include brand tokens and user-supplied context."""
    html = email_svc._render(
        "auth-welcome.html",
        {
            "user_name": "Rudra",
            "user_email": "rudra@example.com",
            "dashboard_url": "https://app.veldrix.com/dashboard",
            "docs_url": "https://app.veldrix.com/docs",
        },
    )
    assert "VeldrixAI" in html
    assert "7C3AED" in html        # brand primary colour
    assert "Rudra" in html
    assert "rudra@example.com" in html


def test_render_ticket_contains_ticket_number(email_svc):
    html = email_svc._render(
        "ticket-confirmation.html",
        {
            "user_name": "Rudra",
            "ticket_number": "VX-SUP-20260523-ZZ99",
            "ticket_subject": "SDK crash on startup",
            "ticket_body": "The SDK raises AttributeError on import.",
            "ticket_priority": "High",
            "ticket_url": "https://app.veldrix.com/support/tickets/VX-SUP-20260523-ZZ99",
        },
    )
    assert "VX-SUP-20260523-ZZ99" in html
    assert "High" in html
