"""
Veldrix PDF Receipt Generator — ReportLab
Branded with the "Royal Governance" metallic palette (deep-audit void
background, slate/platinum accents, icy silver-green for success) and the
Veldrix shield mark. Matches the product UI; no legacy violet/cyan.
"""
import os
from datetime import datetime, timezone
from io import BytesIO

try:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas as rl_canvas
    _REPORTLAB_AVAILABLE = True
except ImportError:
    _REPORTLAB_AVAILABLE = False

# ── Royal Governance palette (see veldrix-royal-tokens.json) ──
_VOID    = "#0A1014"   # deep-audit void background
_SLATE   = "#2D4A5E"   # primary cold blue-grey (replaces violet)
_SILVER  = "#8FA6B5"   # burnished silver-blue accent (replaces cyan)
_PLATINUM= "#AAB8C0"   # cool polished platinum
_SUCCESS = "#6FA98F"   # icy silver-green (verified / amount)
_SNOW    = "#E7ECEF"   # cool light text on dark
_MUTED   = "#7C8993"   # muted slate-grey
_SURFACE = "#121D23"   # deep-audit raised surface
_BORDER  = "#2A3A44"   # dark silver-grey divider

# Brand-logo asset (transparent swirl mark) shipped with the auth service.
# Var name kept for compatibility; the shield art was replaced project-wide.
_SHIELD_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "assets", "veldrix-logo.png",
)

W, H = (595.27, 841.89)  # A4 in points


def generate_receipt_pdf(
    recipient_name: str,
    recipient_email: str,
    payment_intent_id: str,
    amount: int,
    plan_name: str,
) -> bytes:
    """Returns branded PDF receipt as bytes. Raises ImportError if reportlab absent."""
    if not _REPORTLAB_AVAILABLE:
        raise ImportError("reportlab not installed — pip install reportlab")

    from reportlab.lib.colors import HexColor
    buf = BytesIO()
    transaction_id = f"VX-{payment_intent_id[-8:].upper()}"
    amount_fmt = f"${amount / 100:.2f} USD"
    date_str = datetime.now(timezone.utc).strftime("%B %d, %Y · %H:%M UTC")

    c = rl_canvas.Canvas(buf, pagesize=A4)

    # ── Background ──────────────────────────────────────────────────────────
    c.setFillColor(HexColor(_VOID))
    c.rect(0, 0, W, H, fill=1, stroke=0)

    # Subtle metallic ambient glows (slate + icy silver-green)
    c.setFillColorRGB(0.176, 0.290, 0.369, alpha=0.10)
    c.circle(W * 0.1, H * 0.88, 160, fill=1, stroke=0)
    c.setFillColorRGB(0.435, 0.663, 0.561, alpha=0.06)
    c.circle(W * 0.9, H * 0.12, 120, fill=1, stroke=0)

    # ── Header bar ──────────────────────────────────────────────────────────
    c.setFillColor(HexColor(_SURFACE))
    c.rect(0, H - 90, W, 90, fill=1, stroke=0)

    # Top metallic accent line (slate → silver)
    c.setFillColor(HexColor(_SLATE))
    c.rect(0, H - 3, W * 0.5, 3, fill=1, stroke=0)
    c.setFillColor(HexColor(_SILVER))
    c.rect(W * 0.5, H - 3, W * 0.5, 3, fill=1, stroke=0)

    # Shield mark — transparent navy body blends into the dark header,
    # exactly as it reads across the product UI.
    _ls = 34
    if os.path.exists(_SHIELD_PATH):
        c.drawImage(_SHIELD_PATH, 42, H - 64, width=_ls, height=_ls,
                    mask="auto", preserveAspectRatio=True)
    else:
        # Neutral slate roundel fallback (no legacy chevron mark)
        c.setFillColor(HexColor(_SLATE))
        c.roundRect(42, H - 64, _ls, _ls, 8, fill=1, stroke=0)

    # Brand name
    c.setFont("Helvetica-Bold", 18)
    c.setFillColor(HexColor(_SNOW))
    c.drawString(86, H - 44, "Veldrix")
    c.setFont("Helvetica", 8)
    c.setFillColor(HexColor(_MUTED))
    c.drawString(86, H - 57, "Runtime Trust Infrastructure")

    # Receipt label
    c.setFont("Helvetica-Bold", 10)
    c.setFillColor(HexColor(_MUTED))
    c.drawRightString(W - 36, H - 42, "PAYMENT RECEIPT")
    c.setFont("Helvetica", 9)
    c.setFillColor(HexColor(_SILVER))
    c.drawRightString(W - 36, H - 56, transaction_id)

    # ── Status badge ─────────────────────────────────────────────────────────
    badge_y = H - 148
    c.setFillColor(HexColor("#0A1F12"))
    c.roundRect(W / 2 - 72, badge_y - 14, 144, 32, 16, fill=1, stroke=0)
    c.setStrokeColor(HexColor(_SUCCESS))
    c.setLineWidth(1)
    c.roundRect(W / 2 - 72, badge_y - 14, 144, 32, 16, fill=0, stroke=1)
    c.setFillColor(HexColor(_SUCCESS))
    c.circle(W / 2 - 44, badge_y + 2, 4, fill=1, stroke=0)
    c.setFont("Helvetica-Bold", 9)
    c.drawCentredString(W / 2 + 6, badge_y - 2, "PAYMENT VERIFIED")

    # ── Amount ───────────────────────────────────────────────────────────────
    c.setFont("Helvetica-Bold", 44)
    c.setFillColor(HexColor(_SUCCESS))
    c.drawCentredString(W / 2, H - 220, amount_fmt)

    c.setFont("Helvetica", 10)
    c.setFillColor(HexColor(_MUTED))
    c.drawCentredString(W / 2, H - 238, date_str)

    # ── Detail table ─────────────────────────────────────────────────────────
    table_x = 60
    table_w = W - 120
    table_y = H - 280
    row_h = 40

    rows = [
        ("Transaction ID", transaction_id),
        ("Plan", f"{plan_name.title()} Plan"),
        ("Amount",  amount_fmt),
        ("Billing Cycle", "Monthly Subscription"),
        ("Recipient", recipient_name),
        ("Email", recipient_email),
        ("Status", "SUCCEEDED"),
    ]

    # Table background
    c.setFillColor(HexColor(_SURFACE))
    c.roundRect(table_x, table_y - row_h * len(rows), table_w, row_h * len(rows), 10, fill=1, stroke=0)
    c.setStrokeColor(HexColor(_BORDER))
    c.setLineWidth(1)
    c.roundRect(table_x, table_y - row_h * len(rows), table_w, row_h * len(rows), 10, fill=0, stroke=1)

    for i, (label, value) in enumerate(rows):
        row_y = table_y - i * row_h
        # Divider (skip first)
        if i > 0:
            c.setStrokeColor(HexColor(_BORDER))
            c.setLineWidth(0.5)
            c.line(table_x + 16, row_y, table_x + table_w - 16, row_y)
        c.setFont("Helvetica", 9)
        c.setFillColor(HexColor(_MUTED))
        c.drawString(table_x + 20, row_y - 14, label.upper())
        val_color = _SUCCESS if label == "Status" else _SNOW
        c.setFont("Helvetica-Bold" if label == "Transaction ID" else "Helvetica", 11)
        c.setFillColor(HexColor(val_color))
        c.drawRightString(table_x + table_w - 20, row_y - 14, value)

    # ── Footer ────────────────────────────────────────────────────────────────
    footer_y = table_y - row_h * len(rows) - 40
    c.setStrokeColor(HexColor(_BORDER))
    c.setLineWidth(0.5)
    c.line(60, footer_y + 16, W - 60, footer_y + 16)

    c.setFont("Helvetica", 8)
    c.setFillColor(HexColor(_MUTED))
    c.drawCentredString(W / 2, footer_y, "Veldrix · Runtime Trust Infrastructure · support@veldrixai.ca")
    c.setFillColor(HexColor(_BORDER))
    c.drawCentredString(W / 2, footer_y - 14, "© 2026 Veldrix Inc. All rights reserved.")

    # Trust badges
    badges = ["SOC 2 Type II", "ISO 27001", "AES-256 Encrypted"]
    badge_total_w = len(badges) * 100
    bx = (W - badge_total_w) / 2
    for badge in badges:
        c.setFillColor(HexColor(_SUCCESS))
        c.circle(bx, footer_y - 32, 3, fill=1, stroke=0)
        c.setFont("Helvetica", 7)
        c.setFillColor(HexColor(_MUTED))
        c.drawString(bx + 7, footer_y - 35, badge)
        bx += 100

    c.save()
    return buf.getvalue()
