"""
VeldrixAI Transactional Email Service
Resend API + Jinja2 HTML templates

Failures are always logged and never propagate — email must never cause an HTTP 500.
"""
import datetime
import logging
from pathlib import Path
from typing import Any, Dict, Optional

from jinja2 import Environment, FileSystemLoader, select_autoescape

from app.core.config import settings

logger = logging.getLogger(__name__)

TEMPLATE_DIR = Path(__file__).parent.parent / "templates" / "emails"

_jinja_env = Environment(
    loader=FileSystemLoader(str(TEMPLATE_DIR)),
    autoescape=select_autoescape(["html"]),
    trim_blocks=True,
    lstrip_blocks=True,
)


class EmailService:
    """
    Synchronous transactional email sender for VeldrixAI.
    Uses Resend API for delivery and Jinja2 for HTML rendering.
    All public methods return True on success, False on failure — they never raise.
    """

    def __init__(self) -> None:
        self.resend_api_key: str = settings.RESEND_API_KEY
        self.from_name: str = settings.EMAIL_FROM_NAME
        self.from_address: str = settings.EMAIL_FROM
        self.support_address: str = settings.EMAIL_SUPPORT_ADDRESS
        self.frontend_url: str = settings.VELDRIX_UI_URL

        if not self.resend_api_key:
            logger.warning(
                "[EmailService] RESEND_API_KEY is not configured — all email sends will be skipped"
            )

    # ── Internal helpers ────────────────────────────────────────────────────

    def _render(self, template_name: str, context: Dict[str, Any]) -> str:
        """Render a Jinja2 template with brand context injected."""
        base_ctx: Dict[str, Any] = {
            "brand_name": "VeldrixAI",
            "brand_url": self.frontend_url,
            "brand_primary": "#7C3AED",
            "brand_cyan": "#06B6D4",
            "brand_emerald": "#10B981",
            "brand_void": "#050810",
            "support_email": self.support_address,
            "current_year": datetime.date.today().year,
        }
        base_ctx.update(context)
        template = _jinja_env.get_template(template_name)
        return template.render(**base_ctx)

    def _send(
        self,
        to_email: str,
        subject: str,
        html_body: str,
        from_address: Optional[str] = None,
        raise_on_error: bool = False,
    ) -> bool:
        """
        Deliver one email via Resend.
        Returns True on success, False on any failure.
        """
        if not self.resend_api_key:
            logger.warning(
                "[EMAIL] RESEND_API_KEY not set — skipping '%s' → %s", subject, to_email
            )
            return False

        sender = from_address or self.from_address
        full_from = f"{self.from_name} <{sender}>"

        try:
            import resend as _resend  # lazy import — graceful if package missing
            _resend.api_key = self.resend_api_key
            _resend.Emails.send(
                {
                    "from": full_from,
                    "to": [to_email],
                    "subject": subject,
                    "html": html_body,
                    "reply_to": self.from_address,
                }
            )
            logger.info("[EMAIL] Sent '%s' → %s", subject, to_email)
            return True
        except ImportError:
            logger.warning("[EMAIL] resend package not installed — pip install resend")
            return False
        except Exception as exc:
            logger.error("[EMAIL] Failed '%s' → %s: %s", subject, to_email, exc)
            if raise_on_error:
                raise
            return False

    # ── Public API ───────────────────────────────────────────────────────────

    def send_auth_welcome(self, to_email: str, user_name: str) -> bool:
        """Sent immediately after a user registers. Sender: noreply@veldrixai.ca"""
        html = self._render(
            "auth-welcome.html",
            {
                "user_name": user_name,
                "user_email": to_email,
                "dashboard_url": f"{self.frontend_url}/dashboard",
                "docs_url": f"{self.frontend_url}/docs",
            },
        )
        return self._send(
            to_email=to_email,
            subject="Welcome to VeldrixAI — Your AI Governance Layer is Ready",
            html_body=html,
        )

    def send_onboarding_complete(
        self,
        to_email: str,
        user_name: str,
        plan_name: str = "Starter",
    ) -> bool:
        """Sent when a user completes the onboarding flow. Sender: noreply@veldrixai.ca"""
        html = self._render(
            "onboarding-complete.html",
            {
                "user_name": user_name,
                "plan_name": plan_name,
                "dashboard_url": f"{self.frontend_url}/dashboard",
                "quickstart_url": f"{self.frontend_url}/docs/quickstart",
                "policy_url": f"{self.frontend_url}/policy",
                "agent_guard_url": f"{self.frontend_url}/agent-guard",
            },
        )
        return self._send(
            to_email=to_email,
            subject="You're live on VeldrixAI — Trust Infrastructure Activated",
            html_body=html,
        )

    def send_ticket_confirmation(
        self,
        to_email: str,
        user_name: str,
        ticket_number: str,
        ticket_subject: str,
        ticket_body: str,
        priority: str = "Normal",
    ) -> bool:
        """
        Sent when a support ticket is created.
        Sender: rudramani031@veldrixai.ca (monitored support inbox)
        """
        html = self._render(
            "ticket-confirmation.html",
            {
                "user_name": user_name,
                "ticket_number": ticket_number,
                "ticket_subject": ticket_subject,
                "ticket_body": ticket_body,
                "ticket_priority": priority,
                "ticket_url": f"{self.frontend_url}/support/tickets/{ticket_number}",
            },
        )
        return self._send(
            to_email=to_email,
            subject=f"[VeldrixAI Support] Ticket #{ticket_number} Received — {ticket_subject}",
            html_body=html,
            from_address=self.support_address,
        )


# Module-level singleton — import and use directly
email_service = EmailService()
