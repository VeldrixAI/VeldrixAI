"""
VeldrixAI Email Service — Resend (resend.com)

Sends:
  1. Welcome email on user registration
  2. OTP verification email for payment authorization
  3. Payment receipt with PDF attachment
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


# ── Welcome email ─────────────────────────────────────────────────────────────

_WELCOME_HTML = """\
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Welcome to VeldrixAI</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@300;400;500&display=swap');
*{{margin:0;padding:0;box-sizing:border-box}}
body{{background:#050810;color:#f0f2ff;font-family:'DM Sans',-apple-system,sans-serif;font-weight:300}}
.wrap{{max-width:600px;margin:0 auto;padding:48px 24px}}
.logo{{font-family:'Syne',sans-serif;font-weight:800;font-size:26px;letter-spacing:-0.5px;color:#a78bfa;text-align:center;margin-bottom:32px}}
.hero{{font-family:'Syne',sans-serif;font-weight:800;font-size:34px;letter-spacing:-1px;line-height:1.1;text-align:center;margin-bottom:12px}}
.sub{{font-size:14px;color:rgba(240,242,255,0.5);line-height:1.7;text-align:center;max-width:480px;margin:0 auto 40px}}
.card{{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:20px;padding:28px;margin-bottom:24px;position:relative;overflow:hidden}}
.card-line{{position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,rgba(124,58,237,0.6),rgba(6,182,212,0.6),transparent)}}
.pillars{{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:28px}}
.pillar{{background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:14px;display:flex;align-items:flex-start;gap:8px}}
.dot{{width:7px;height:7px;border-radius:50%;background:#10b981;box-shadow:0 0 6px rgba(16,185,129,0.6);margin-top:3px;flex-shrink:0}}
.pname{{font-size:12px;font-weight:500;color:rgba(240,242,255,0.85);margin-bottom:2px}}
.pdesc{{font-size:11px;color:rgba(240,242,255,0.35)}}
.metrics{{display:flex;gap:12px;justify-content:center;margin:20px 0}}
.metric{{text-align:center;padding:14px 20px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:12px}}
.mval{{font-family:'Courier New',monospace;font-size:20px;font-weight:700;color:#7c3aed;margin-bottom:4px}}
.mlabel{{font-size:9px;letter-spacing:2px;text-transform:uppercase;color:rgba(240,242,255,0.3)}}
.cta{{display:block;background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff !important;text-decoration:none;text-align:center;padding:15px 32px;border-radius:12px;font-family:'Syne',sans-serif;font-weight:700;font-size:14px;margin-bottom:32px;box-shadow:0 8px 28px rgba(124,58,237,0.35)}}
.footer{{text-align:center;border-top:1px solid rgba(255,255,255,0.06);padding-top:24px;margin-top:32px}}
.footer p{{font-size:11px;color:rgba(240,242,255,0.2);line-height:1.8}}
.trust{{display:flex;gap:16px;justify-content:center;margin-bottom:16px}}
.ti{{font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:rgba(240,242,255,0.25);display:flex;align-items:center;gap:5px}}
.td{{width:5px;height:5px;border-radius:50%;background:#10b981}}
</style>
</head>
<body>
<div class="wrap">
  <div class="logo">Veldrix<span style="color:#06b6d4">AI</span></div>
  <div class="hero">Welcome to the<br>Trust Layer, {name}.</div>
  <p class="sub">Your AI systems are now under governance. VeldrixAI intercepts, evaluates, and enforces trust policies across every inference — in real time, at production scale.</p>

  <div class="card">
    <div class="card-line"></div>
    <p style="font-size:10px;letter-spacing:3px;text-transform:uppercase;color:rgba(240,242,255,0.25);margin-bottom:16px;font-weight:500">Five-Pillar Trust Evaluation</p>
    <div class="pillars">
      <div class="pillar"><div class="dot"></div><div><div class="pname">Safety &amp; Toxicity</div><div class="pdesc">Real-time harmful content interception</div></div></div>
      <div class="pillar"><div class="dot"></div><div><div class="pname">Hallucination Detection</div><div class="pdesc">Factual accuracy scoring at inference</div></div></div>
      <div class="pillar"><div class="dot"></div><div><div class="pname">Bias &amp; Fairness</div><div class="pdesc">Ethical alignment enforcement</div></div></div>
      <div class="pillar"><div class="dot"></div><div><div class="pname">Prompt Security</div><div class="pdesc">Injection &amp; jailbreak prevention</div></div></div>
      <div class="pillar" style="grid-column:1/-1"><div class="dot"></div><div><div class="pname">Compliance &amp; PII</div><div class="pdesc">GDPR/HIPAA data masking &amp; regulatory guardrails</div></div></div>
    </div>
  </div>

  <div class="metrics">
    <div class="metric"><div class="mval">&lt;50ms</div><div class="mlabel">Eval Latency</div></div>
    <div class="metric"><div class="mval">99.9%</div><div class="mlabel">Uptime SLA</div></div>
    <div class="metric"><div class="mval">AES-256</div><div class="mlabel">Encryption</div></div>
  </div>

  <a href="{dashboard_url}" class="cta">→ Launch Your Governance Dashboard</a>

  <div class="footer">
    <div class="trust">
      <div class="ti"><div class="td"></div>SOC 2 Type II</div>
      <div class="ti"><div class="td"></div>ISO 27001</div>
      <div class="ti"><div class="td"></div>AES-256</div>
    </div>
    <p>VeldrixAI · Runtime Trust Infrastructure<br>
    {frontend_url} · support@veldrixai.ca<br><br>
    You received this because you created a VeldrixAI account.<br>
    © 2026 VeldrixAI Inc. All rights reserved.</p>
  </div>
</div>
</body>
</html>
"""

# ── OTP email ─────────────────────────────────────────────────────────────────

_OTP_HTML = """\
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
body{{background:#050810;color:#f0f2ff;font-family:-apple-system,sans-serif;margin:0;padding:0}}
.wrap{{max-width:460px;margin:0 auto;padding:48px 24px;text-align:center}}
.logo{{font-size:22px;font-weight:800;color:#a78bfa;margin-bottom:32px}}
.title{{font-size:26px;font-weight:800;letter-spacing:-0.5px;margin-bottom:8px}}
.sub{{font-size:13px;color:rgba(240,242,255,0.45);margin-bottom:36px;line-height:1.6}}
.box{{background:rgba(124,58,237,0.08);border:1px solid rgba(124,58,237,0.3);border-radius:16px;padding:28px;margin-bottom:20px}}
.lbl{{font-size:9px;letter-spacing:3px;text-transform:uppercase;color:rgba(240,242,255,0.3);margin-bottom:10px}}
.code{{font-family:'Courier New',monospace;font-size:46px;font-weight:700;letter-spacing:12px;color:#7c3aed;text-shadow:0 0 28px rgba(124,58,237,0.45)}}
.exp{{font-size:11px;color:rgba(240,242,255,0.3);margin-top:14px}}
.warn{{background:rgba(244,63,94,0.08);border:1px solid rgba(244,63,94,0.2);border-radius:10px;padding:11px 18px;font-size:12px;color:rgba(244,63,94,0.8);margin-bottom:20px}}
.footer{{font-size:11px;color:rgba(240,242,255,0.2);margin-top:28px;line-height:1.8}}
</style>
</head>
<body>
<div class="wrap">
  <div class="logo">Veldrix<span style="color:#06b6d4">AI</span></div>
  <div class="title">Payment Authorization</div>
  <p class="sub">Your AES-256 secured one-time password for payment verification</p>
  <div class="box">
    <div class="lbl">Verification Code</div>
    <div class="code">{otp}</div>
    <div class="exp">⏱ Expires in {expires_minutes} minutes</div>
  </div>
  <div class="warn">🔒 Never share this code. VeldrixAI will never ask for it by phone or chat.</div>
  <p class="footer">VeldrixAI · AES-256 Encrypted Payment Vault<br>© 2026 VeldrixAI Inc. · support@veldrixai.ca</p>
</div>
</body>
</html>
"""

# ── Receipt email ─────────────────────────────────────────────────────────────

_RECEIPT_HTML = """\
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
body{{background:#050810;color:#f0f2ff;font-family:-apple-system,sans-serif;margin:0;padding:0}}
.wrap{{max-width:520px;margin:0 auto;padding:48px 24px}}
.logo{{font-size:22px;font-weight:800;color:#a78bfa;text-align:center;margin-bottom:28px}}
.icon{{text-align:center;margin-bottom:20px}}
.ic{{display:inline-flex;align-items:center;justify-content:center;width:60px;height:60px;border-radius:50%;background:rgba(16,185,129,0.12);border:1px solid rgba(16,185,129,0.3);font-size:28px}}
.title{{font-size:26px;font-weight:800;text-align:center;margin-bottom:6px}}
.sub{{text-align:center;color:rgba(240,242,255,0.45);margin-bottom:36px;font-size:13px}}
.amount{{font-size:32px;font-weight:800;color:#10b981;text-align:center;margin:20px 0 6px}}
.badge{{text-align:center;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:rgba(16,185,129,0.7);margin-bottom:28px}}
.card{{background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.07);border-radius:16px;padding:24px;margin-bottom:20px}}
.row{{display:flex;justify-content:space-between;padding:11px 0;border-bottom:1px solid rgba(255,255,255,0.05);font-size:13px}}
.row:last-child{{border-bottom:none}}
.lbl{{color:rgba(240,242,255,0.4)}}
.val{{font-weight:500}}
.footer{{text-align:center;font-size:11px;color:rgba(240,242,255,0.2);margin-top:28px;line-height:1.8}}
</style>
</head>
<body>
<div class="wrap">
  <div class="logo">VeldrixAI</div>
  <div class="icon"><div class="ic">✓</div></div>
  <div class="title">Payment Confirmed</div>
  <p class="sub">Your subscription is now active. Receipt attached as PDF.</p>
  <div class="amount">{amount_fmt}</div>
  <p class="badge">Transaction Verified</p>
  <div class="card">
    <div class="row"><span class="lbl">Transaction ID</span><span class="val">{transaction_id}</span></div>
    <div class="row"><span class="lbl">Plan</span><span class="val">{plan_name} Plan</span></div>
    <div class="row"><span class="lbl">Amount</span><span class="val">{amount_fmt} USD</span></div>
    <div class="row"><span class="lbl">Billing Cycle</span><span class="val">Monthly</span></div>
    <div class="row"><span class="lbl">Recipient</span><span class="val">{to_name}</span></div>
  </div>
  <p class="footer">VeldrixAI · Runtime Trust Infrastructure<br>support@veldrixai.ca · {frontend_url}<br>© 2026 VeldrixAI Inc.</p>
</div>
</body>
</html>
"""


def send_welcome_email(to_email: str, to_name: str) -> None:
    first = (to_name.split()[0] if to_name else "there")
    html = _WELCOME_HTML.format(
        name=first,
        dashboard_url=f"{_FRONTEND}/dashboard",
        frontend_url=_FRONTEND,
    )
    _send(
        to=to_email,
        subject=f"Welcome to VeldrixAI, {first} — Your Trust Layer Is Active",
        html=html,
    )


def send_otp_email(to_email: str, otp: str, expires_minutes: int = 10) -> None:
    html = _OTP_HTML.format(otp=otp, expires_minutes=expires_minutes)
    _send(
        to=to_email,
        subject="VeldrixAI — Your Payment Authorization Code",
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
    html = _RECEIPT_HTML.format(
        transaction_id=transaction_id,
        plan_name=plan_name.title(),
        amount_fmt=amount_fmt,
        to_name=to_name,
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
        attachments = [{"filename": f"VeldrixAI_Receipt_{transaction_id}.pdf", "content": list(pdf_bytes)}]
    except Exception as exc:
        logger.warning("[Email] PDF generation failed, sending without attachment: %s", exc)

    _send(
        to=to_email,
        subject=f"VeldrixAI Receipt — {transaction_id} · {amount_fmt}",
        html=html,
        attachments=attachments or None,
    )
