"""
VeldrixAI PDF Receipt Generator — ReportLab
Branded with Void background, Violet primary, Syne-style headings.
"""
from datetime import datetime, timezone
from io import BytesIO

try:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas as rl_canvas
    _REPORTLAB_AVAILABLE = True
except ImportError:
    _REPORTLAB_AVAILABLE = False

_VOID    = "#050810"
_VIOLET  = "#7C3AED"
_CYAN    = "#06B6D4"
_EMERALD = "#10B981"
_SNOW    = "#F0F2FF"
_MUTED   = "#8B8FA8"
_SURFACE = "#0D1220"
_BORDER  = "#1A2035"

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

    # Subtle violet/cyan ambient circles
    c.setFillColorRGB(0.49, 0.23, 0.93, alpha=0.05)
    c.circle(W * 0.1, H * 0.88, 160, fill=1, stroke=0)
    c.setFillColorRGB(0.02, 0.71, 0.83, alpha=0.04)
    c.circle(W * 0.9, H * 0.12, 120, fill=1, stroke=0)

    # ── Header bar ──────────────────────────────────────────────────────────
    c.setFillColor(HexColor(_SURFACE))
    c.rect(0, H - 90, W, 90, fill=1, stroke=0)

    # Top gradient line (violet → cyan)
    c.setFillColor(HexColor(_VIOLET))
    c.rect(0, H - 3, W * 0.5, 3, fill=1, stroke=0)
    c.setFillColor(HexColor(_CYAN))
    c.rect(W * 0.5, H - 3, W * 0.5, 3, fill=1, stroke=0)

    # Logo mark (V chevron)
    c.setStrokeColor(HexColor(_SNOW))
    c.setLineWidth(2.5)
    c.setLineCap(1)
    c.line(48, H - 48, 62, H - 66)
    c.line(62, H - 66, 76, H - 48)
    c.setFillColor(HexColor(_CYAN))
    c.circle(62, H - 66, 3.5, fill=1, stroke=0)
    c.setFillColor(HexColor(_SNOW))
    c.circle(62, H - 66, 1.8, fill=1, stroke=0)

    # Brand name
    c.setFont("Helvetica-Bold", 18)
    c.setFillColor(HexColor(_SNOW))
    c.drawString(86, H - 44, "VeldrixAI")
    c.setFont("Helvetica", 8)
    c.setFillColor(HexColor(_MUTED))
    c.drawString(86, H - 57, "Runtime Trust Infrastructure")

    # Receipt label
    c.setFont("Helvetica-Bold", 10)
    c.setFillColor(HexColor(_MUTED))
    c.drawRightString(W - 36, H - 42, "PAYMENT RECEIPT")
    c.setFont("Helvetica", 9)
    c.setFillColor(HexColor(_VIOLET))
    c.drawRightString(W - 36, H - 56, transaction_id)

    # ── Status badge ─────────────────────────────────────────────────────────
    badge_y = H - 148
    c.setFillColor(HexColor("#0A1F12"))
    c.roundRect(W / 2 - 72, badge_y - 14, 144, 32, 16, fill=1, stroke=0)
    c.setStrokeColor(HexColor(_EMERALD))
    c.setLineWidth(1)
    c.roundRect(W / 2 - 72, badge_y - 14, 144, 32, 16, fill=0, stroke=1)
    c.setFillColor(HexColor(_EMERALD))
    c.circle(W / 2 - 44, badge_y + 2, 4, fill=1, stroke=0)
    c.setFont("Helvetica-Bold", 9)
    c.drawCentredString(W / 2 + 6, badge_y - 2, "PAYMENT VERIFIED")

    # ── Amount ───────────────────────────────────────────────────────────────
    c.setFont("Helvetica-Bold", 44)
    c.setFillColor(HexColor(_EMERALD))
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
        val_color = _EMERALD if label == "Status" else _SNOW
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
    c.drawCentredString(W / 2, footer_y, "VeldrixAI · Runtime Trust Infrastructure · support@veldrixai.ca")
    c.setFillColor(HexColor(_BORDER))
    c.drawCentredString(W / 2, footer_y - 14, "© 2026 VeldrixAI Inc. All rights reserved.")

    # Trust badges
    badges = ["SOC 2 Type II", "ISO 27001", "AES-256 Encrypted"]
    badge_total_w = len(badges) * 100
    bx = (W - badge_total_w) / 2
    for badge in badges:
        c.setFillColor(HexColor(_EMERALD))
        c.circle(bx, footer_y - 32, 3, fill=1, stroke=0)
        c.setFont("Helvetica", 7)
        c.setFillColor(HexColor(_MUTED))
        c.drawString(bx + 7, footer_y - 35, badge)
        bx += 100

    c.save()
    return buf.getvalue()
