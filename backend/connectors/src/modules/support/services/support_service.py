import logging
import random
import string
from datetime import datetime
from pathlib import Path
from typing import Optional
from uuid import UUID, uuid4

from fastapi import HTTPException
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.orm import Session

from src.modules.support.models import SupportTicket
from src.modules.support.schemas.support_schema import SubmitTicketRequest

logger = logging.getLogger(__name__)

# ── Email settings — reads from process env (Docker) then .env file (native) ──
_ENV_FILE = Path(__file__).resolve().parents[5] / ".env"  # → backend/.env

class _EmailSettings(BaseSettings):
    RESEND_API_KEY: str = ""
    EMAIL_FROM: str = "noreply@veldrixai.ca"
    EMAIL_FROM_NAME: str = "VeldrixAI"
    EMAIL_SUPPORT_ADDRESS: str = "support@veldrixai.ca"
    VELDRIX_UI_URL: str = "https://app.veldrixai.ca"

    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE),
        case_sensitive=True,
        extra="ignore",
    )

_email_cfg = _EmailSettings()

# Jinja2 is optional — if not installed the service still sends a plain fallback.
try:
    from jinja2 import Environment, FileSystemLoader, select_autoescape as _j2_se
    _TEMPLATE_DIR = Path(__file__).parent.parent.parent.parent / "templates" / "emails"
    _jinja_env = Environment(
        loader=FileSystemLoader(str(_TEMPLATE_DIR)),
        autoescape=_j2_se(["html"]),
        trim_blocks=True,
        lstrip_blocks=True,
    )
except ImportError:
    _jinja_env = None
    logger.warning("[Support] Jinja2 not installed — ticket confirmation will use plain-text fallback")

SUPPORT_INBOX = "rudramani031@veldrixai.ca"

_PRIORITY_SLA = {
    "low":      "3–5 business days",
    "medium":   "1–2 business days",
    "high":     "Within 4 hours",
    "critical": "Within 1 hour",
}

_PRIORITY_PILLS = {
    "low":      {"color": "#16a34a", "bg": "#f0fdf4", "border": "#bbf7d0"},
    "medium":   {"color": "#d97706", "bg": "#fffbeb", "border": "#fde68a"},
    "high":     {"color": "#ea580c", "bg": "#fff7ed", "border": "#fed7aa"},
    "critical": {"color": "#e11d48", "bg": "#fff1f2", "border": "#fecdd3"},
}


def _generate_ticket_id() -> str:
    date_part = datetime.utcnow().strftime("%Y%m%d")
    suffix = "".join(random.choices(string.ascii_uppercase + string.digits, k=4))
    return f"VX-SUP-{date_part}-{suffix}"


def _send_email(*, to: str, subject: str, html: str, from_addr: Optional[str] = None) -> None:
    resend_key = _email_cfg.RESEND_API_KEY.strip()
    if not resend_key:
        logger.warning("[Support] RESEND_API_KEY not configured — skipping email to %s", to)
        return
    try:
        import resend  # type: ignore
        resend.api_key = resend_key
        _from = from_addr or _email_cfg.EMAIL_FROM
        result = resend.Emails.send({
            "from":    f"{_email_cfg.EMAIL_FROM_NAME} <{_from}>",
            "to":      [to],
            "subject": subject,
            "html":    html,
        })
        logger.info("[Support] Email sent to %s — %s (id=%s)", to, subject, getattr(result, "id", result))
    except ImportError:
        logger.warning("[Support] resend package not installed — pip install resend")
    except Exception as exc:
        logger.error("[Support] Email delivery failed to %s: %s", to, exc, exc_info=True)


def _html_notification(ticket: SupportTicket) -> str:
    sla   = _PRIORITY_SLA.get(ticket.priority, "1–2 business days")
    pill  = _PRIORITY_PILLS.get(ticket.priority, _PRIORITY_PILLS["medium"])
    ts    = ticket.created_at.strftime("%b %d, %Y at %H:%M UTC")
    cat   = ticket.category.replace("_", " ").title()
    frontend_url  = _email_cfg.VELDRIX_UI_URL
    support_addr  = _email_cfg.EMAIL_SUPPORT_ADDRESS

    try:
        template = _jinja_env.get_template("ticket-notification.html")
        return template.render(
            brand_name="VeldrixAI",
            brand_url=frontend_url,
            support_email=support_addr,
            current_year=datetime.utcnow().year,
            ticket_id=ticket.ticket_id,
            subject=ticket.subject,
            user_email=ticket.user_email,
            category=cat,
            priority=ticket.priority,
            priority_color=pill["color"],
            priority_bg=pill["bg"],
            priority_border=pill["border"],
            description=ticket.description,
            sla=sla,
            submitted_at=ts,
        )
    except Exception as exc:
        logger.warning("[Support] Notification template render failed, using fallback: %s", exc)
        return (
            f"<p><strong>New ticket {ticket.ticket_id}</strong></p>"
            f"<p>From: {ticket.user_email}</p>"
            f"<p>Subject: {ticket.subject}</p>"
            f"<p>Priority: {ticket.priority} — SLA: {sla}</p>"
            f"<p>{ticket.description}</p>"
        )


def _html_confirmation(ticket: SupportTicket) -> str:
    sla          = _PRIORITY_SLA.get(ticket.priority, "1–2 business days")
    pill         = _PRIORITY_PILLS.get(ticket.priority, _PRIORITY_PILLS["medium"])
    frontend_url = _email_cfg.VELDRIX_UI_URL
    support_addr = _email_cfg.EMAIL_SUPPORT_ADDRESS
    ts           = ticket.created_at.strftime("%b %d, %Y at %H:%M UTC")
    cat          = ticket.category.replace("_", " ").title()

    try:
        template = _jinja_env.get_template("ticket-confirmation.html")
        return template.render(
            brand_name="VeldrixAI",
            brand_url=frontend_url,
            support_email=support_addr,
            current_year=datetime.utcnow().year,
            user_name=ticket.user_email.split("@")[0],
            ticket_id=ticket.ticket_id,
            subject=ticket.subject,
            category=cat,
            priority=ticket.priority,
            priority_color=pill["color"],
            priority_bg=pill["bg"],
            priority_border=pill["border"],
            description=ticket.description,
            sla=sla,
            submitted_at=ts,
        )
    except Exception as exc:
        logger.warning("[Support] Jinja2 render failed, using fallback: %s", exc)
        # Plain fallback — ensures email still sends even if template is missing
        return (
            f"<p>Hi, your ticket <strong>{ticket.ticket_id}</strong> has been received.</p>"
            f"<p>Subject: {ticket.subject}</p>"
            f"<p>Expected response: {sla}</p>"
            f"<p>VeldrixAI Support &mdash; {support_addr}</p>"
        )


class SupportService:
    def __init__(self, db: Session):
        self.db = db

    def submit_ticket(
        self,
        request: SubmitTicketRequest,
        user_id: Optional[UUID] = None,
    ) -> SupportTicket:
        # Collision-safe ticket ID
        ticket_id = _generate_ticket_id()
        for _ in range(4):
            if not self.db.query(SupportTicket).filter(SupportTicket.ticket_id == ticket_id).first():
                break
            ticket_id = _generate_ticket_id()

        ticket = SupportTicket(
            id=uuid4(),
            ticket_id=ticket_id,
            user_id=user_id,
            user_email=request.user_email,
            subject=request.subject.strip(),
            category=request.category,
            priority=request.priority,
            description=request.description.strip(),
            status="open",
        )
        try:
            self.db.add(ticket)
            self.db.commit()
            self.db.refresh(ticket)
        except Exception as exc:
            self.db.rollback()
            logger.error("[Support] DB insert failed: %s", exc)
            raise HTTPException(status_code=500, detail="Failed to create support ticket")

        # Fire emails — never let email failure block the response
        try:
            _send_email(
                to=SUPPORT_INBOX,
                subject=f"[{ticket.priority.upper()}] {ticket.ticket_id} — {ticket.subject}",
                html=_html_notification(ticket),
            )
        except Exception as exc:
            logger.error("[Support] Notification email failed: %s", exc)

        try:
            _send_email(
                to=ticket.user_email,
                subject=f"Support Ticket {ticket.ticket_id} — We've received your request",
                html=_html_confirmation(ticket),
                from_addr=_email_cfg.EMAIL_SUPPORT_ADDRESS,
            )
        except Exception as exc:
            logger.error("[Support] Confirmation email failed: %s", exc)

        return ticket

    def get_tickets_by_user(self, user_id: UUID) -> list:
        return (
            self.db.query(SupportTicket)
            .filter(SupportTicket.user_id == user_id)
            .order_by(SupportTicket.created_at.desc())
            .limit(25)
            .all()
        )
