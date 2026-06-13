"""
Veldrix Email Service — Resend (resend.com)

Sends:
  1. Welcome email on user registration (legacy fallback path)
  2. OTP verification email for payment authorization
  3. Payment receipt with PDF attachment

Branding: "Royal Governance" metallic palette (slate / silver / icy-green) on a
clean light card with the Veldrix shield mark. No neon glow, no purple/cyan.
"""
import logging
from typing import Optional

from app.core.config import settings

logger = logging.getLogger(__name__)

_FROM = f"{settings.EMAIL_FROM_NAME} <{settings.EMAIL_FROM}>"
_FRONTEND = settings.VELDRIX_UI_URL


def _send(*, to: str, subject: str, html: str, attachments: Optional[list] = None) -> None:
    """Send an email via Resend. Silently logs on failure — never raises."""
    if not settings.RESEND_API_KEY:
        logger.warning("[Email] RESEND_API_KEY not set — skipping email to %s", to)
        return
    try:
        import resend
        resend.api_key = settings.RESEND_API_KEY
        payload: dict = {"from": _FROM, "to": [to], "subject": subject, "html": html}
        if attachments:
            payload["attachments"] = attachments
        resend.Emails.send(payload)
    except ImportError:
        logger.warning("[Email] resend package not installed — pip install resend")
    except Exception as exc:
        logger.error("[Email] Failed to send to %s: %s", to, exc)


# ── Shared shell ──────────────────────────────────────────────────────────────
# {{ }} are literal braces for str.format(); {placeholders} are substituted.

_FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif"
_MONO = "'SFMono-Regular',Consolas,'Courier New',monospace"


def _header(frontend_url: str) -> str:
    return f"""
  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td valign="middle" style="padding-right:13px;">
        <img src="{frontend_url}/veldrix-shield.png" width="40" height="40" alt="Veldrix"
             style="display:block;width:40px;height:40px;border:0;">
      </td>
      <td valign="middle">
        <div style="font-family:{_FONT};font-size:20px;font-weight:700;color:#16252F;
                    letter-spacing:-0.4px;line-height:1;">Veldrix</div>
        <div style="font-family:{_FONT};font-size:10px;color:#8593a0;letter-spacing:2px;
                    text-transform:uppercase;margin-top:4px;">Runtime Trust Infrastructure</div>
      </td>
    </tr>
  </table>"""


# ── Welcome email (legacy fallback) ─────────────────────────────────────────────

_WELCOME_HTML = """\
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Welcome to Veldrix</title></head>
<body style="margin:0;padding:0;background:#eef1f3;font-family:{font};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eef1f3;">
    <tr><td align="center" style="padding:44px 20px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
             style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e1e7ea;border-radius:16px;overflow:hidden;">
        <tr><td style="padding:30px 40px 26px;">{header}</td></tr>
        <tr><td style="height:2px;background:linear-gradient(90deg,#2D4A5E 0%,#8FA6B5 52%,#9FC4B5 100%);font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td style="padding:38px 40px 34px;">
          <p style="margin:0 0 16px;font-family:{font};font-size:27px;font-weight:700;color:#16252F;letter-spacing:-0.6px;line-height:1.25;">
            Welcome to the trust layer, {name}.</p>
          <p style="margin:0 0 30px;font-family:{font};font-size:15px;color:#44525a;line-height:1.7;">
            Your AI systems are now under governance. Veldrix intercepts, evaluates, and enforces
            trust policies on every inference &mdash; in real time, at production scale.</p>

          <div style="font-family:{font};font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#8593a0;margin-bottom:16px;">
            Five pillars, evaluated on every response</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:30px;">
            {pillars}
          </table>

          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="border-radius:10px;background:#2D4A5E;">
              <a href="{dashboard_url}" style="display:inline-block;padding:15px 32px;font-family:{font};
                 font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">
                Open your dashboard &rarr;</a>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:26px 40px;background:#f5f7f8;border-top:1px solid #e8edef;text-align:center;">
          <p style="margin:0 0 8px;font-family:{font};font-size:12px;color:#8593a0;line-height:1.6;">
            Veldrix &middot; Runtime Trust Infrastructure for Production AI</p>
          <p style="margin:0;font-family:{font};font-size:11px;color:#aab4bc;line-height:1.6;">
            {frontend_url} &middot; support@veldrixai.ca &middot; &copy; 2026 Veldrix Inc.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>
"""


def _welcome_pillars() -> str:
    rows = [
        ("Safety &amp; Toxicity", "Harmful content blocked before it reaches users."),
        ("Hallucination Detection", "Factual accuracy scored at inference."),
        ("Bias &amp; Fairness", "Discriminatory patterns detected and flagged."),
        ("Prompt Security", "Injection and jailbreak attempts intercepted."),
        ("Compliance &amp; PII", "GDPR / HIPAA masking with regulatory guardrails."),
    ]
    out = ""
    for name, desc in rows:
        out += (
            '<tr>'
            '<td valign="top" width="16" style="padding:0 0 13px 0;">'
            '<div style="width:7px;height:7px;border-radius:2px;background:#2D4A5E;margin-top:6px;"></div></td>'
            f'<td valign="top" style="padding:0 0 13px 0;">'
            f'<span style="font-family:{_FONT};font-size:14px;font-weight:600;color:#16252F;">{name}</span>'
            f'<span style="font-family:{_FONT};font-size:14px;color:#6b7980;">&nbsp;&mdash;&nbsp;{desc}</span></td>'
            '</tr>'
        )
    return out


# ── OTP email ───────────────────────────────────────────────────────────────────

_OTP_HTML = """\
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Veldrix — Payment authorization</title></head>
<body style="margin:0;padding:0;background:#eef1f3;font-family:{font};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eef1f3;">
    <tr><td align="center" style="padding:44px 20px;">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0"
             style="max-width:480px;width:100%;background:#ffffff;border:1px solid #e1e7ea;border-radius:16px;overflow:hidden;">
        <tr><td style="padding:30px 40px 26px;">{header}</td></tr>
        <tr><td style="height:2px;background:linear-gradient(90deg,#2D4A5E 0%,#8FA6B5 52%,#9FC4B5 100%);font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td style="padding:38px 40px 34px;text-align:center;">
          <p style="margin:0 0 8px;font-family:{font};font-size:22px;font-weight:700;color:#16252F;letter-spacing:-0.4px;">
            Payment authorization</p>
          <p style="margin:0 0 28px;font-family:{font};font-size:14px;color:#6b7980;line-height:1.6;">
            Enter this one-time code to verify your payment. It expires in {expires_minutes} minutes.</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:22px;">
            <tr><td style="background:#f5f7f8;border:1px solid #e1e7ea;border-radius:12px;padding:24px;text-align:center;">
              <div style="font-family:{font};font-size:10px;letter-spacing:3px;text-transform:uppercase;color:#8593a0;margin-bottom:12px;">
                Verification Code</div>
              <div style="font-family:{mono};font-size:40px;font-weight:700;letter-spacing:10px;color:#2D4A5E;">{otp}</div>
            </td></tr>
          </table>
          <p style="margin:0;font-family:{font};font-size:12px;color:#8593a0;line-height:1.6;">
            Never share this code. Veldrix will never ask for it by phone or chat.</p>
        </td></tr>
        <tr><td style="padding:22px 40px;background:#f5f7f8;border-top:1px solid #e8edef;text-align:center;">
          <p style="margin:0;font-family:{font};font-size:11px;color:#aab4bc;line-height:1.6;">
            Veldrix &middot; Secured payment vault &middot; &copy; 2026 Veldrix Inc.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>
"""


# ── Receipt email ─────────────────────────────────────────────────────────────

_RECEIPT_HTML = """\
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Veldrix — Payment confirmed</title></head>
<body style="margin:0;padding:0;background:#eef1f3;font-family:{font};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eef1f3;">
    <tr><td align="center" style="padding:44px 20px;">
      <table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0"
             style="max-width:520px;width:100%;background:#ffffff;border:1px solid #e1e7ea;border-radius:16px;overflow:hidden;">
        <tr><td style="padding:30px 40px 26px;">{header}</td></tr>
        <tr><td style="height:2px;background:linear-gradient(90deg,#2D4A5E 0%,#8FA6B5 52%,#9FC4B5 100%);font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td style="padding:38px 40px 16px;text-align:center;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin-bottom:18px;">
            <tr><td style="width:52px;height:52px;background:#eaf2ee;border:1px solid #cfe0d8;border-radius:50%;
                           text-align:center;vertical-align:middle;font-size:24px;color:#3e6b59;">&#10003;</td></tr>
          </table>
          <p style="margin:0 0 6px;font-family:{font};font-size:24px;font-weight:700;color:#16252F;letter-spacing:-0.4px;">
            Payment confirmed</p>
          <p style="margin:0 0 20px;font-family:{font};font-size:14px;color:#6b7980;line-height:1.6;">
            Your subscription is active. A detailed receipt is attached as a PDF.</p>
          <div style="font-family:{font};font-size:34px;font-weight:700;color:#3e6b59;letter-spacing:-0.5px;">{amount_fmt}</div>
          <div style="font-family:{font};font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#8593a0;margin-top:6px;">
            Transaction Verified</div>
        </td></tr>
        <tr><td style="padding:18px 40px 38px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                 style="background:#f5f7f8;border:1px solid #e8edef;border-radius:12px;">
            <tr><td style="padding:8px 22px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                {rows}
              </table>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:22px 40px;background:#f5f7f8;border-top:1px solid #e8edef;text-align:center;">
          <p style="margin:0 0 6px;font-family:{font};font-size:12px;color:#8593a0;line-height:1.6;">
            Veldrix &middot; Runtime Trust Infrastructure for Production AI</p>
          <p style="margin:0;font-family:{font};font-size:11px;color:#aab4bc;line-height:1.6;">
            {frontend_url} &middot; support@veldrixai.ca &middot; &copy; 2026 Veldrix Inc.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>
"""


def _receipt_rows(pairs: list) -> str:
    out = ""
    for i, (label, value) in enumerate(pairs):
        border = "" if i == len(pairs) - 1 else "border-bottom:1px solid #e8edef;"
        out += (
            f'<tr><td style="{border}padding:12px 0;font-family:{_FONT};font-size:13px;color:#8593a0;">{label}</td>'
            f'<td style="{border}padding:12px 0;font-family:{_FONT};font-size:13px;font-weight:600;'
            f'color:#16252F;text-align:right;">{value}</td></tr>'
        )
    return out


# ── Public senders ──────────────────────────────────────────────────────────────

def send_welcome_email(to_email: str, to_name: str) -> None:
    first = (to_name.split()[0] if to_name else "there")
    html = _WELCOME_HTML.format(
        font=_FONT,
        header=_header(_FRONTEND),
        name=first,
        pillars=_welcome_pillars(),
        dashboard_url=f"{_FRONTEND}/dashboard",
        frontend_url=_FRONTEND,
    )
    _send(
        to=to_email,
        subject=f"Welcome to Veldrix, {first} — your trust layer is live",
        html=html,
    )


def send_otp_email(to_email: str, otp: str, expires_minutes: int = 10) -> None:
    html = _OTP_HTML.format(
        font=_FONT,
        mono=_MONO,
        header=_header(_FRONTEND),
        otp=otp,
        expires_minutes=expires_minutes,
    )
    _send(
        to=to_email,
        subject="Veldrix — your payment authorization code",
        html=html,
    )


def send_receipt_email(
    to_email: str,
    to_name: str,
    payment_intent_id: str,
    amount: int,
    plan_name: str,
) -> None:
    transaction_id = f"VX-{payment_intent_id[-8:].upper()}"
    amount_fmt = f"${amount / 100:.2f}"
    rows = _receipt_rows([
        ("Transaction ID", transaction_id),
        ("Plan", f"{plan_name.title()} Plan"),
        ("Amount", f"{amount_fmt} USD"),
        ("Billing Cycle", "Monthly"),
        ("Recipient", to_name),
    ])
    html = _RECEIPT_HTML.format(
        font=_FONT,
        header=_header(_FRONTEND),
        amount_fmt=amount_fmt,
        rows=rows,
        frontend_url=_FRONTEND,
    )

    attachments = []
    try:
        from app.utils.pdf_receipt import generate_receipt_pdf
        pdf_bytes = generate_receipt_pdf(
            recipient_name=to_name,
            recipient_email=to_email,
            payment_intent_id=payment_intent_id,
            amount=amount,
            plan_name=plan_name,
        )
        attachments = [{"filename": f"Veldrix_Receipt_{transaction_id}.pdf", "content": list(pdf_bytes)}]
    except Exception as exc:
        logger.warning("[Email] PDF generation failed, sending without attachment: %s", exc)

    _send(
        to=to_email,
        subject=f"Veldrix receipt — {transaction_id} · {amount_fmt}",
        html=html,
        attachments=attachments or None,
    )
