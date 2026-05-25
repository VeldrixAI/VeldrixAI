import os
import logging
import random
import string
from datetime import datetime
from pathlib import Path
from typing import Optional
from uuid import UUID, uuid4

from fastapi import HTTPException
from sqlalchemy.orm import Session

from src.modules.support.models import SupportTicket
from src.modules.support.schemas.support_schema import SubmitTicketRequest

logger = logging.getLogger(__name__)

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

_PRIORITY_COLOR = {
    "low":      "#10b981",
    "medium":   "#f59e0b",
    "high":     "#f97316",
    "critical": "#f43f5e",
}


def _generate_ticket_id() -> str:
    date_part = datetime.utcnow().strftime("%Y%m%d")
    suffix = "".join(random.choices(string.ascii_uppercase + string.digits, k=4))
    return f"VX-SUP-{date_part}-{suffix}"


def _send_email(*, to: str, subject: str, html: str, from_addr: Optional[str] = None) -> None:
    resend_key = os.getenv("RESEND_API_KEY", "").strip()
    if not resend_key:
        logger.warning("[Support] RESEND_API_KEY not configured — skipping email to %s", to)
        return
    try:
        import resend  # type: ignore
        resend.api_key = resend_key
        from_name = os.getenv("EMAIL_FROM_NAME", "VeldrixAI")
        _from = from_addr or os.getenv("EMAIL_FROM", "support@send.veldrixai.ca")
        result = resend.Emails.send({
            "from":    f"{from_name} <{_from}>",
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
    sla    = _PRIORITY_SLA.get(ticket.priority, "1–2 business days")
    color  = _PRIORITY_COLOR.get(ticket.priority, "#f59e0b")
    ts     = ticket.created_at.strftime("%Y-%m-%d at %H:%M UTC")
    desc   = ticket.description.replace("\n", "<br>")
    cat    = ticket.category.replace("_", " ").title()
    return f"""<!DOCTYPE html>
<html>
<head><meta charset="UTF-8">
<style>
*{{margin:0;padding:0;box-sizing:border-box}}
body{{background:#050810;color:#f0f2ff;font-family:-apple-system,'DM Sans',sans-serif}}
.wrap{{max-width:600px;margin:0 auto;padding:40px 24px}}
.logo{{font-size:22px;font-weight:800;color:#a78bfa;text-align:center;margin-bottom:28px;letter-spacing:-0.5px}}
.badge{{display:inline-flex;align-items:center;gap:6px;padding:5px 14px;border-radius:20px;font-size:11px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;background:rgba(124,58,237,0.12);border:1px solid rgba(124,58,237,0.3);color:#a78bfa;margin-bottom:20px}}
.title{{font-size:24px;font-weight:800;margin-bottom:6px;letter-spacing:-0.5px}}
.meta{{font-size:12px;color:rgba(240,242,255,0.35);margin-bottom:32px;font-family:monospace}}
.card{{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:16px;padding:24px;margin-bottom:16px}}
.row{{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.05);font-size:13px}}
.row:last-child{{border-bottom:none}}
.lbl{{color:rgba(240,242,255,0.4)}}
.val{{font-weight:500}}
.pri{{padding:2px 10px;border-radius:6px;font-size:11px;font-weight:700;text-transform:uppercase;background:{color}20;border:1px solid {color}40;color:{color}}}
.desc-card{{background:rgba(124,58,237,0.05);border:1px solid rgba(124,58,237,0.15);border-radius:14px;padding:20px;margin-bottom:16px}}
.desc-lbl{{font-size:10px;letter-spacing:2px;text-transform:uppercase;color:rgba(240,242,255,0.25);margin-bottom:10px}}
.desc-body{{font-size:14px;line-height:1.7;color:rgba(240,242,255,0.75)}}
.footer{{text-align:center;font-size:11px;color:rgba(240,242,255,0.2);margin-top:28px;line-height:1.9;border-top:1px solid rgba(255,255,255,0.06);padding-top:24px}}
</style></head>
<body>
<div class="wrap">
  <div class="logo">Veldrix<span style="color:#06b6d4">AI</span> &middot; Support</div>
  <div style="text-align:center;margin-bottom:20px"><div class="badge">&#9679; New Support Ticket</div></div>
  <div class="title">{ticket.subject}</div>
  <div class="meta">{ticket.ticket_id} &middot; {ts}</div>
  <div class="card">
    <div class="row"><span class="lbl">Ticket ID</span><span class="val" style="font-family:monospace">{ticket.ticket_id}</span></div>
    <div class="row"><span class="lbl">From</span><span class="val">{ticket.user_email}</span></div>
    <div class="row"><span class="lbl">Category</span><span class="val">{cat}</span></div>
    <div class="row"><span class="lbl">Priority</span><span class="val"><span class="pri">{ticket.priority}</span></span></div>
    <div class="row"><span class="lbl">SLA Target</span><span class="val">{sla}</span></div>
  </div>
  <div class="desc-card">
    <div class="desc-lbl">Issue Description</div>
    <div class="desc-body">{desc}</div>
  </div>
  <p class="footer">VeldrixAI Support System &middot; veldrixai.ca<br>
  Reply directly to this email to respond to {ticket.user_email}<br>
  &copy; 2026 VeldrixAI Inc. All rights reserved.</p>
</div>
</body>
</html>"""


def _html_confirmation(ticket: SupportTicket) -> str:
    sla          = _PRIORITY_SLA.get(ticket.priority, "1–2 business days")
    color        = _PRIORITY_COLOR.get(ticket.priority, "#f59e0b")
    frontend_url = os.getenv("VELDRIX_UI_URL", "https://veldrixai.ca")
    support_addr = os.getenv("EMAIL_SUPPORT_ADDRESS", "rudramani031@veldrixai.ca")
    ts           = ticket.created_at.strftime("%b %d, %Y at %H:%M UTC")
    cat          = ticket.category.replace("_", " ").title()

    _alpha = "20"  # 12% opacity hex suffix for background
    _border = "40"  # 25% opacity hex suffix for border

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
            priority_color=color,
            priority_bg=f"{color}{_alpha}",
            priority_border=f"{color}{_border}",
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
                from_addr=os.getenv("EMAIL_SUPPORT_ADDRESS", "support@send.veldrixai.ca"),
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
