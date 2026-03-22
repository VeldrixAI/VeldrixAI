"""
VeldrixAI PDF Report Generator
Produces branded, chart-rich governance intelligence reports using ReportLab + matplotlib.
"""

import io
import math
from datetime import datetime, timedelta
from typing import Any

# ReportLab
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, Image, HRFlowable, KeepTogether,
)
from reportlab.pdfgen import canvas as rl_canvas

# Matplotlib for charts
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import numpy as np


# ── BRAND CONSTANTS ───────────────────────────────────────────────────────────

class VX:
    VIOLET_HEX  = "#7c3aed"
    INDIGO_HEX  = "#4f46e5"
    CYAN_HEX    = "#06b6d4"
    EMERALD_HEX = "#10b981"
    ROSE_HEX    = "#f43f5e"
    AMBER_HEX   = "#f59e0b"
    DARK_HEX    = "#0f172a"
    MID_HEX     = "#475569"
    LIGHT_HEX   = "#f8fafc"
    VOID_HEX    = "#050810"
    BORDER_HEX  = "#e2e8f0"

    RL_VIOLET  = colors.HexColor("#7c3aed")
    RL_INDIGO  = colors.HexColor("#4f46e5")
    RL_CYAN    = colors.HexColor("#06b6d4")
    RL_EMERALD = colors.HexColor("#10b981")
    RL_ROSE    = colors.HexColor("#f43f5e")
    RL_AMBER   = colors.HexColor("#f59e0b")
    RL_DARK    = colors.HexColor("#0f172a")
    RL_MID     = colors.HexColor("#475569")
    RL_LIGHT   = colors.HexColor("#f8fafc")
    RL_VOID    = colors.HexColor("#050810")
    RL_BORDER  = colors.HexColor("#e2e8f0")

    PILLAR_COLORS = {
        "Safety":          "#f43f5e",
        "Hallucination":   "#f59e0b",
        "Bias":            "#7c3aed",
        "Prompt Security": "#06b6d4",
        "Compliance":      "#10b981",
    }

    CHART_PALETTE = [
        "#7c3aed", "#06b6d4", "#10b981", "#f59e0b", "#f43f5e",
        "#4f46e5", "#a78bfa", "#67e8f9", "#6ee7b7", "#fcd34d",
    ]


# ── MATPLOTLIB STYLE ──────────────────────────────────────────────────────────

def _apply_style() -> None:
    plt.rcParams.update({
        "figure.facecolor": "#ffffff",
        "axes.facecolor": "#f8fafc",
        "axes.edgecolor": "#e2e8f0",
        "axes.labelcolor": "#0f172a",
        "axes.titlecolor": "#0f172a",
        "axes.titleweight": "bold",
        "axes.titlesize": 11,
        "axes.labelsize": 9,
        "axes.spines.top": False,
        "axes.spines.right": False,
        "axes.grid": True,
        "grid.color": "#e2e8f0",
        "grid.linewidth": 0.6,
        "grid.alpha": 0.8,
        "xtick.color": "#64748b",
        "ytick.color": "#64748b",
        "xtick.labelsize": 8,
        "ytick.labelsize": 8,
        "font.family": "DejaVu Sans",
        "text.color": "#0f172a",
        "legend.frameon": True,
        "legend.framealpha": 0.9,
        "legend.edgecolor": "#e2e8f0",
        "legend.fontsize": 8,
    })

_apply_style()


# ── CHART GENERATORS ─────────────────────────────────────────────────────────

def _png(fig: plt.Figure) -> bytes:
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=150, bbox_inches="tight",
                facecolor="white", edgecolor="none")
    plt.close(fig)
    buf.seek(0)
    return buf.read()


def chart_pillar_radar(scores: dict, title: str = "Trust Pillar Radar") -> bytes:
    labels = list(scores.keys())
    values = list(scores.values())
    N = len(labels)
    angles = [n / float(N) * 2 * math.pi for n in range(N)]
    angles += angles[:1]
    vals = values + values[:1]

    fig, ax = plt.subplots(figsize=(4.5, 4.5), subplot_kw=dict(polar=True))
    ax.set_yticks([20, 40, 60, 80, 100])
    ax.set_yticklabels(["20", "40", "60", "80", "100"], size=7, color="#94a3b8")
    ax.set_ylim(0, 100)
    ax.plot(angles, vals, "o-", linewidth=2, color=VX.VIOLET_HEX)
    ax.fill(angles, vals, alpha=0.18, color=VX.VIOLET_HEX)
    outer = [100] * (N + 1)
    ax.plot(angles, outer, "-", linewidth=0.5, color="#e2e8f0", zorder=0)
    ax.set_xticks(angles[:-1])
    ax.set_xticklabels(labels, size=8.5, fontweight="bold", color="#0f172a")
    ax.grid(color="#e2e8f0", linewidth=0.6)
    ax.spines["polar"].set_color("#e2e8f0")
    ax.set_title(title, pad=18, fontsize=11, fontweight="bold", color="#0f172a")
    return _png(fig)


def chart_pillar_bars(scores: dict, title: str = "Trust Pillar Scores") -> bytes:
    fig, ax = plt.subplots(figsize=(5.5, 3.2))
    labels = list(scores.keys())
    values = list(scores.values())
    bar_colors = [VX.PILLAR_COLORS.get(l, VX.VIOLET_HEX) for l in labels]
    y_pos = range(len(labels))

    ax.barh(y_pos, [100] * len(labels), color="#e2e8f0", alpha=0.4, height=0.55, zorder=2)
    bars = ax.barh(y_pos, values, color=bar_colors, alpha=0.85, height=0.55, zorder=3)

    for bar, val in zip(bars, values):
        ax.text(val + 1.5, bar.get_y() + bar.get_height() / 2,
                f"{val:.1f}", va="center", ha="left",
                fontsize=8.5, fontweight="bold", color="#0f172a")

    ax.set_yticks(y_pos)
    ax.set_yticklabels(labels, fontsize=9, color="#0f172a")
    ax.set_xlim(0, 110)
    ax.set_xlabel("Score (0–100)", fontsize=8, color="#64748b")
    ax.set_title(title, fontsize=11, fontweight="bold", color="#0f172a", pad=10)
    ax.axvline(x=70, color=VX.AMBER_HEX, linewidth=1, linestyle="--", alpha=0.6, label="Min (70)")
    ax.axvline(x=90, color=VX.EMERALD_HEX, linewidth=1, linestyle="--", alpha=0.6, label="Target (90)")
    ax.legend(fontsize=7.5, loc="lower right")
    ax.grid(axis="x", color="#e2e8f0", linewidth=0.6, zorder=1)
    plt.tight_layout()
    return _png(fig)


def chart_enforcement_donut(actions: dict, title: str = "Enforcement Actions") -> bytes:
    fig, ax = plt.subplots(figsize=(4.2, 3.8))
    labels = list(actions.keys())
    values = list(actions.values())
    color_map = {
        "Allow":      VX.EMERALD_HEX,
        "Block":      VX.ROSE_HEX,
        "Rewrite":    VX.VIOLET_HEX,
        "Mask":       VX.AMBER_HEX,
        "Escalate":   VX.CYAN_HEX,
        "Regenerate": VX.INDIGO_HEX,
    }
    chart_colors = [color_map.get(l, "#94a3b8") for l in labels]

    wedges, _, autotexts = ax.pie(
        values, labels=None, colors=chart_colors,
        autopct="%1.1f%%", pctdistance=0.75,
        startangle=90, counterclock=False,
        wedgeprops=dict(width=0.52, edgecolor="white", linewidth=2),
    )
    for at in autotexts:
        at.set_fontsize(8)
        at.set_fontweight("bold")
        at.set_color("white")

    total = sum(values)
    ax.text(0, 0.08, str(total), ha="center", va="center",
            fontsize=16, fontweight="bold", color="#0f172a")
    ax.text(0, -0.18, "total evals", ha="center", va="center",
            fontsize=7.5, color="#64748b")

    patches = [mpatches.Patch(color=c, label=l) for l, c in zip(labels, chart_colors)]
    ax.legend(handles=patches, loc="lower center", bbox_to_anchor=(0.5, -0.18),
              ncol=3, fontsize=7.5, frameon=True, edgecolor="#e2e8f0")
    ax.set_title(title, fontsize=11, fontweight="bold", color="#0f172a", pad=8)
    plt.tight_layout()
    return _png(fig)


def chart_trend_line(trend_data: list[dict], title: str = "Trust Score Trend") -> bytes:
    fig, ax = plt.subplots(figsize=(6.5, 3.2))
    dates = [d["date"] for d in trend_data]
    x = range(len(dates))

    series = {
        "Overall":       ("#0f172a", 2.5, "-"),
        "Safety":        (VX.ROSE_HEX, 1.5, "--"),
        "Hallucination": (VX.AMBER_HEX, 1.5, "--"),
        "Compliance":    (VX.EMERALD_HEX, 1.5, ":"),
    }
    for key, (color, lw, ls) in series.items():
        vals = [d.get(key.lower(), d.get("overall", 80)) for d in trend_data]
        ax.plot(x, vals, color=color, linewidth=lw, linestyle=ls,
                label=key, marker="o", markersize=3, markerfacecolor=color)

    ax.axhspan(70, 90, alpha=0.06, color=VX.AMBER_HEX, label="Caution zone")
    ax.axhline(y=90, color=VX.EMERALD_HEX, linewidth=0.8, linestyle=":", alpha=0.5)

    tick_positions = list(range(0, len(dates), max(1, len(dates) // 6)))
    ax.set_xticks(tick_positions)
    ax.set_xticklabels([dates[i] for i in tick_positions], rotation=30, ha="right", fontsize=7.5)
    ax.set_ylim(50, 105)
    ax.set_ylabel("Score", fontsize=8)
    ax.set_title(title, fontsize=11, fontweight="bold", color="#0f172a", pad=10)
    ax.legend(fontsize=7.5, loc="lower right", ncol=2)
    ax.grid(color="#e2e8f0", linewidth=0.6)
    plt.tight_layout()
    return _png(fig)


def chart_risk_distribution(buckets: dict, title: str = "Response Risk Distribution") -> bytes:
    fig, ax = plt.subplots(figsize=(4.5, 3.0))
    labels = list(buckets.keys())
    values = list(buckets.values())
    risk_colors = {
        "Low":      VX.EMERALD_HEX,
        "Medium":   VX.AMBER_HEX,
        "High":     VX.ROSE_HEX,
        "Critical": "#7c0a02",
    }
    bar_colors = [risk_colors.get(l, VX.VIOLET_HEX) for l in labels]
    bars = ax.bar(labels, values, color=bar_colors, alpha=0.85,
                  width=0.55, zorder=3, edgecolor="white", linewidth=1.5)
    for bar, val in zip(bars, values):
        ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 0.5,
                str(val), ha="center", va="bottom",
                fontsize=9, fontweight="bold", color="#0f172a")
    ax.set_ylabel("# Responses", fontsize=8, color="#64748b")
    ax.set_title(title, fontsize=11, fontweight="bold", color="#0f172a", pad=10)
    ax.grid(axis="y", color="#e2e8f0", linewidth=0.6, zorder=1)
    plt.tight_layout()
    return _png(fig)


# ── PAGE TEMPLATE (header + footer) ──────────────────────────────────────────

class VeldrixPageTemplate:
    def __init__(self, report_name: str, report_id: str, report_date: str, tenant: str):
        self.report_name = report_name
        self.report_id = report_id
        self.report_date = report_date
        self.tenant = tenant

    def _header(self, c: rl_canvas.Canvas, page_w: float, page_h: float) -> None:
        hh = 22 * mm

        # Background bar
        c.setFillColor(VX.RL_VOID)
        c.rect(0, page_h - hh, page_w, hh, fill=1, stroke=0)

        # Violet accent stripe
        c.setFillColor(VX.RL_VIOLET)
        c.rect(0, page_h - hh - 1.5 * mm, page_w, 1.5 * mm, fill=1, stroke=0)

        # Logo square
        lx, ly = 8 * mm, page_h - hh + 4 * mm
        ls = 14 * mm
        c.setFillColor(VX.RL_VIOLET)
        c.roundRect(lx, ly, ls, ls, 2.5 * mm, fill=1, stroke=0)

        # V mark
        c.setStrokeColor(colors.white)
        c.setLineWidth(2)
        c.setLineCap(1)
        mx = lx + ls / 2
        c.line(lx + 3.5 * mm, ly + ls - 3.5 * mm, mx, ly + 3.5 * mm)
        c.line(mx, ly + 3.5 * mm, lx + ls - 3.5 * mm, ly + ls - 3.5 * mm)

        # Cyan dot
        c.setFillColor(VX.RL_CYAN)
        c.circle(mx, ly + 3.5 * mm, 1.4 * mm, fill=1, stroke=0)

        # Wordmark
        c.setFillColor(colors.white)
        c.setFont("Helvetica-Bold", 13)
        c.drawString(lx + ls + 4 * mm, page_h - hh + 9 * mm, "VeldrixAI")
        c.setFont("Helvetica", 7)
        c.setFillColor(colors.HexColor("#a78bfa"))
        c.drawString(lx + ls + 4 * mm, page_h - hh + 4.5 * mm, "Runtime Trust Infrastructure")

        # Report ID + date (right)
        c.setFillColor(colors.HexColor("#94a3b8"))
        c.setFont("Courier", 7.5)
        c.drawRightString(page_w - 8 * mm, page_h - hh + 12 * mm, f"Report ID: {self.report_id}")
        c.drawRightString(page_w - 8 * mm, page_h - hh + 6.5 * mm, self.report_date)

        # Name chip
        name_w = c.stringWidth(self.report_name, "Helvetica-Bold", 7.5)
        chip_w = name_w + 5 * mm
        chip_x = page_w - 8 * mm - chip_w
        chip_y = page_h - hh + 0.5 * mm
        c.setFillColor(VX.RL_VIOLET)
        c.setFillAlpha(0.3)
        c.roundRect(chip_x - 1 * mm, chip_y, chip_w, 5 * mm, 1 * mm, fill=1, stroke=0)
        c.setFillAlpha(1)
        c.setFillColor(colors.HexColor("#c4b5fd"))
        c.setFont("Helvetica-Bold", 7.5)
        c.drawString(chip_x + 1.5 * mm, chip_y + 1.5 * mm, self.report_name)

    def _footer(self, c: rl_canvas.Canvas, page_w: float, page_h: float, page_num: int) -> None:
        fy = 10 * mm
        c.setStrokeColor(VX.RL_BORDER)
        c.setLineWidth(0.5)
        c.line(8 * mm, fy + 5 * mm, page_w - 8 * mm, fy + 5 * mm)

        c.setFillColor(colors.HexColor("#94a3b8"))
        c.setFont("Helvetica", 7)
        c.drawString(8 * mm, fy + 2 * mm,
                     "CONFIDENTIAL — Generated by VeldrixAI · veldrix.ai · Not for redistribution")

        c.setFont("Helvetica-Bold", 7.5)
        c.setFillColor(colors.HexColor("#475569"))
        c.drawCentredString(page_w / 2, fy + 2 * mm, f"Page {page_num}")

        c.setFont("Helvetica", 7)
        c.setFillColor(colors.HexColor("#94a3b8"))
        c.drawRightString(page_w - 8 * mm, fy + 2 * mm, self.tenant)

        # Diagonal watermark
        c.saveState()
        c.setFillColor(VX.RL_VIOLET)
        c.setFillAlpha(0.04)
        c.setFont("Helvetica-Bold", 52)
        c.translate(page_w / 2, page_h / 2)
        c.rotate(35)
        c.drawCentredString(0, 0, "VELDRIXAI")
        c.restoreState()

    def first_page(self, c: rl_canvas.Canvas, doc: Any) -> None:
        pw, ph = A4
        self._header(c, pw, ph)
        self._footer(c, pw, ph, 1)

    def later_pages(self, c: rl_canvas.Canvas, doc: Any) -> None:
        pw, ph = A4
        self._header(c, pw, ph)
        self._footer(c, pw, ph, doc.page)


# ── STYLES ────────────────────────────────────────────────────────────────────

def _styles() -> dict:
    s = {}
    s["cover_title"] = ParagraphStyle(
        "cover_title", fontName="Helvetica-Bold", fontSize=28,
        textColor=VX.RL_DARK, spaceAfter=8, leading=34)
    s["cover_sub"] = ParagraphStyle(
        "cover_sub", fontName="Helvetica", fontSize=13,
        textColor=VX.RL_MID, spaceAfter=4, leading=18)
    s["section"] = ParagraphStyle(
        "section", fontName="Helvetica-Bold", fontSize=13,
        textColor=VX.RL_VOID, spaceAfter=4, spaceBefore=14)
    s["subsection"] = ParagraphStyle(
        "subsection", fontName="Helvetica-Bold", fontSize=11,
        textColor=VX.RL_VIOLET, spaceAfter=4, spaceBefore=8)
    s["body"] = ParagraphStyle(
        "body", fontName="Helvetica", fontSize=9.5,
        textColor=VX.RL_DARK, spaceAfter=6, leading=15, alignment=TA_JUSTIFY)
    s["body_sm"] = ParagraphStyle(
        "body_sm", fontName="Helvetica", fontSize=8.5,
        textColor=VX.RL_MID, spaceAfter=4, leading=13)
    s["caption"] = ParagraphStyle(
        "caption", fontName="Helvetica", fontSize=7.5,
        textColor=colors.HexColor("#94a3b8"), alignment=TA_CENTER, spaceAfter=8)
    s["finding"] = ParagraphStyle(
        "finding", fontName="Helvetica-Bold", fontSize=10,
        textColor=VX.RL_DARK, spaceAfter=3, leading=14)
    s["disclaimer"] = ParagraphStyle(
        "disclaimer", fontName="Helvetica", fontSize=8,
        textColor=colors.HexColor("#94a3b8"), leading=12,
        alignment=TA_JUSTIFY, backColor=VX.RL_LIGHT,
        borderColor=VX.RL_BORDER, borderWidth=1, borderPad=8)
    return s


# ── FLOWABLE HELPERS ──────────────────────────────────────────────────────────

def _divider(label: str, s: dict) -> list:
    items = [Spacer(1, 4 * mm), Paragraph(label.upper(), s["section"])]
    items.append(HRFlowable(width="100%", thickness=2,
                             color=VX.RL_VIOLET, spaceAfter=4))
    return items


def _th(text: str) -> Paragraph:
    return Paragraph(text, ParagraphStyle(
        "th", fontName="Helvetica-Bold", fontSize=8.5, textColor=colors.white))


def _th_c(text: str) -> Paragraph:
    return Paragraph(text, ParagraphStyle(
        "thc", fontName="Helvetica-Bold", fontSize=8.5,
        textColor=colors.white, alignment=TA_CENTER))


def _td(text: str, color: str = "#0f172a", bold: bool = False, center: bool = False) -> Paragraph:
    return Paragraph(str(text), ParagraphStyle(
        "td", fontName="Helvetica-Bold" if bold else "Helvetica",
        fontSize=8.5, textColor=colors.HexColor(color),
        leading=12, alignment=TA_CENTER if center else TA_LEFT))


def _metric_cards(metrics: list[dict]) -> Table:
    cells = []
    for m in metrics:
        cells.append([
            Paragraph(m["value"], ParagraphStyle(
                "mv", fontName="Helvetica-Bold", fontSize=20,
                textColor=colors.HexColor(m.get("color", VX.VIOLET_HEX)),
                alignment=TA_CENTER, leading=24)),
            Paragraph(m["label"], ParagraphStyle(
                "ml", fontName="Helvetica", fontSize=7.5,
                textColor=colors.HexColor("#64748b"),
                alignment=TA_CENTER, leading=11)),
        ])
    # Flatten to single row
    row = [item for cell in cells for item in cell]
    # Build as 2-row-per-card layout using nested
    card_cols = [Table([[cells[i][0]], [cells[i][1]]], colWidths=[42 * mm]) for i in range(len(metrics))]
    t = Table([card_cols], colWidths=[44 * mm] * len(metrics))
    t.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), VX.RL_LIGHT),
        ("BOX",           (0, 0), (-1, -1), 0.5, VX.RL_BORDER),
        ("INNERGRID",     (0, 0), (-1, -1), 0.5, VX.RL_BORDER),
        ("TOPPADDING",    (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ("ALIGN",         (0, 0), (-1, -1), "CENTER"),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
    ]))
    return t


def _findings_table(findings: list[dict]) -> Table:
    sev_colors = {
        "CRITICAL": ("#7c0a02", "#fee2e2"),
        "HIGH":     ("#dc2626", "#fef2f2"),
        "MEDIUM":   ("#d97706", "#fffbeb"),
        "LOW":      ("#15803d", "#f0fdf4"),
        "PASS":     ("#0891b2", "#ecfeff"),
    }
    header = [_th("Pillar"), _th_c("Severity"), _th("Finding"), _th("Recommendation")]
    rows = [header]
    style_cmds = [
        ("BACKGROUND",    (0, 0), (-1, 0),  VX.RL_VOID),
        ("GRID",          (0, 0), (-1, -1), 0.5, VX.RL_BORDER),
        ("ROWBACKGROUNDS",(0, 1), (-1, -1), [colors.white, VX.RL_LIGHT]),
        ("TOPPADDING",    (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING",   (0, 0), (-1, -1), 8),
        ("ALIGN",         (1, 0), (1, -1),  "CENTER"),
    ]
    for i, f in enumerate(findings):
        sev = f.get("severity", "LOW")
        fg, bg = sev_colors.get(sev, ("#000000", "#f8fafc"))
        row_idx = i + 1
        rows.append([
            _td(f.get("pillar", ""), color=fg, bold=True),
            _td(sev, color=fg, bold=True, center=True),
            _td(f.get("description", "")),
            _td(f.get("action", ""), color=VX.MID_HEX),
        ])
        style_cmds.append(("BACKGROUND", (1, row_idx), (1, row_idx), colors.HexColor(bg)))

    t = Table(rows, colWidths=[28 * mm, 22 * mm, 65 * mm, 55 * mm], repeatRows=1)
    t.setStyle(TableStyle(style_cmds))
    return t


# ── COVER PAGE ────────────────────────────────────────────────────────────────

def _cover(data: dict, s: dict) -> list:
    story = [Spacer(1, 28 * mm)]
    badge = data.get("report_type", "GOVERNANCE INTELLIGENCE REPORT").upper()
    story.append(Paragraph(
        f'<font color="{VX.VIOLET_HEX}">■</font> &nbsp;'
        f'<font color="#64748b" size="9"><b>{badge}</b></font>',
        ParagraphStyle("badge", fontName="Helvetica", fontSize=9,
                       textColor=VX.RL_MID, spaceAfter=10)))

    story.append(Paragraph(data.get("title", "AI Model Trust Evaluation Report"), s["cover_title"]))
    story.append(Paragraph(data.get("subtitle", "Deep Research Analysis · VeldrixAI"), s["cover_sub"]))
    story.append(Spacer(1, 6 * mm))
    story.append(HRFlowable(width="100%", thickness=1.5, color=VX.RL_VIOLET, spaceAfter=6))

    # Meta grid
    meta = [
        ["Report Name",       data.get("report_name", "Cobalt Nexus")],
        ["Report ID",         data.get("vx_report_id", "VX-00000000-0000")],
        ["Generated",         data.get("generated_at", datetime.utcnow().strftime("%B %d, %Y %H:%M UTC"))],
        ["Evaluated Model",   data.get("model_name", "—")],
        ["Evaluation Window", data.get("eval_window", "Last 30 Days")],
        ["Total Evaluations", str(data.get("total_evals", 0))],
        ["Tenant / Org",      data.get("tenant", "VeldrixAI Platform")],
        ["Pillar Version",    data.get("pillar_version", "v2.1.0")],
    ]
    mt = Table(meta, colWidths=[52 * mm, 108 * mm])
    mt.setStyle(TableStyle([
        ("FONTNAME",      (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTNAME",      (1, 0), (1, -1), "Courier"),
        ("FONTSIZE",      (0, 0), (-1, -1), 9),
        ("TEXTCOLOR",     (0, 0), (0, -1),  VX.RL_MID),
        ("TEXTCOLOR",     (1, 0), (1, -1),  VX.RL_DARK),
        ("TOPPADDING",    (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING",   (0, 0), (-1, -1), 0),
        ("LINEBELOW",     (0, 0), (-1, -2), 0.3, colors.HexColor("#f1f5f9")),
    ]))
    story.append(mt)
    story.append(Spacer(1, 8 * mm))

    # Score hero
    overall = data.get("overall_score", 82.4)
    score_color = VX.EMERALD_HEX if overall >= 85 else VX.AMBER_HEX if overall >= 70 else VX.ROSE_HEX
    score_label = "TRUSTED" if overall >= 85 else "CAUTION" if overall >= 70 else "AT RISK"
    pw = data.get("pillar_weights", {
        "Safety": 0.25, "Hallucination": 0.25, "Bias": 0.20,
        "Prompt Security": 0.15, "Compliance": 0.15,
    })

    hero = Table([[
        Paragraph(
            f'<font color="{score_color}" size="36"><b>{overall:.1f}</b></font><br/>'
            f'<font color="#94a3b8" size="9">/ 100 · {score_label}</font>',
            ParagraphStyle("sc", fontName="Helvetica-Bold", alignment=TA_CENTER, leading=42)),
        Paragraph(
            f"<b>Overall Trust Score</b><br/><br/>"
            "Weighted average across five VeldrixAI trust pillars: "
            + ", ".join(
                f"{name} ({w*100:.0f}%)"
                for name, w in pw.items()
            ) + ".",
            ParagraphStyle("scd", fontName="Helvetica", fontSize=9,
                           textColor=VX.RL_MID, leading=14)),
    ]], colWidths=[45 * mm, 115 * mm])
    hero.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (0, 0), VX.RL_LIGHT),
        ("BOX",           (0, 0), (-1, -1), 1, VX.RL_BORDER),
        ("INNERGRID",     (0, 0), (-1, -1), 0.5, VX.RL_BORDER),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING",    (0, 0), (-1, -1), 14),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 14),
        ("LEFTPADDING",   (0, 0), (-1, -1), 12),
    ]))
    story.append(hero)
    story.append(Spacer(1, 6 * mm))
    story.append(Paragraph(
        "This report was automatically generated by the VeldrixAI Runtime Trust Engine. "
        "It contains AI-evaluated risk analysis, policy compliance findings, and enforcement "
        "recommendations based on live production traffic. All scores are computed deterministically "
        "using the VeldrixAI five-pillar evaluation framework. This document is confidential and "
        "intended solely for the authorized recipient.",
        s["disclaimer"]))
    story.append(PageBreak())
    return story


# ── SAMPLE DATA HELPERS ───────────────────────────────────────────────────────

def _sample_trend() -> list[dict]:
    base = datetime.utcnow()
    trend = []
    for i in range(30):
        d = base - timedelta(days=29 - i)
        noise = np.random.uniform(-4, 4)
        trend.append({
            "date":          d.strftime("%m/%d"),
            "overall":       round(min(100, max(50, 78 + noise + i * 0.2)), 1),
            "safety":        round(min(100, max(50, 88 + noise)), 1),
            "hallucination": round(min(100, max(50, 75 + noise)), 1),
            "compliance":    round(min(100, max(50, 80 + noise)), 1),
        })
    return trend


# ── MAIN ENTRY POINT ──────────────────────────────────────────────────────────

def generate_veldrix_pdf(report_data: dict) -> bytes:
    """
    Generate a full branded VeldrixAI PDF and return it as bytes.

    report_data keys (all optional — defaults provided):
        report_name, vx_report_id, title, subtitle, report_type,
        generated_at, model_name, eval_window, total_evals, tenant,
        pillar_version, overall_score, pillar_scores, pillar_weights,
        enforcement_actions, risk_distribution, trend_data, findings,
        executive_summary, methodology, recommendations, appendix_data
    """
    s = _styles()
    tpl = VeldrixPageTemplate(
        report_name=report_data.get("report_name", "Cobalt Nexus"),
        report_id=report_data.get("vx_report_id", "VX-00000000-0000"),
        report_date=report_data.get("generated_at", datetime.utcnow().strftime("%Y-%m-%d")),
        tenant=report_data.get("tenant", "VeldrixAI Platform"),
    )

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        topMargin=28 * mm, bottomMargin=20 * mm,
        leftMargin=14 * mm, rightMargin=14 * mm,
        title=f"VeldrixAI Report — {report_data.get('report_name', '')}",
        author="VeldrixAI Runtime Trust Engine",
        subject="AI Governance Intelligence Report",
        creator="VeldrixAI v2.1.0",
    )

    story = []

    # ── COVER ──
    story.extend(_cover(report_data, s))

    # ── EXEC SUMMARY ──
    story.extend(_divider("1. Executive Summary", s))
    story.append(Paragraph(
        report_data.get("executive_summary",
            "This report provides a comprehensive analysis of AI model trust performance "
            "evaluated through the VeldrixAI runtime governance platform. Results reflect "
            "a statistically significant sample of production traffic across all active "
            "use cases. Trust scores are computed using the five-pillar deterministic framework "
            "and represent the model's ability to meet enterprise governance requirements."),
        s["body"]))
    story.append(Spacer(1, 4 * mm))

    # Metric cards
    pillar_scores = report_data.get("pillar_scores", {
        "Safety": 91.2, "Hallucination": 84.7, "Bias": 88.3,
        "Prompt Security": 95.1, "Compliance": 79.4,
    })
    enforcement = report_data.get("enforcement_actions", {
        "Allow": 8420, "Block": 312, "Rewrite": 184, "Mask": 67, "Escalate": 17,
    })
    total = report_data.get("total_evals", sum(enforcement.values()))
    interventions = enforcement.get("Block", 0) + enforcement.get("Rewrite", 0)
    pass_rate = enforcement.get("Allow", 0) / max(total, 1) * 100

    story.append(_metric_cards([
        {"value": f"{report_data.get('overall_score', 82.4):.1f}",
         "label": "Overall Trust Score", "color": VX.VIOLET_HEX},
        {"value": f"{total:,}", "label": "Total Evaluations", "color": VX.INDIGO_HEX},
        {"value": str(interventions), "label": "Interventions Made", "color": VX.ROSE_HEX},
        {"value": f"{pass_rate:.1f}%", "label": "Pass-Through Rate", "color": VX.EMERALD_HEX},
    ]))
    story.append(Spacer(1, 4 * mm))

    # ── TRUST PILLAR ANALYSIS ──
    story.extend(_divider("2. Trust Pillar Analysis", s))

    radar_img = Image(io.BytesIO(chart_pillar_radar(pillar_scores)), width=82 * mm, height=82 * mm)
    bars_img  = Image(io.BytesIO(chart_pillar_bars(pillar_scores)),  width=100 * mm, height=82 * mm)
    chart_row = Table([[radar_img, bars_img]], colWidths=[84 * mm, 102 * mm])
    chart_row.setStyle(TableStyle([
        ("ALIGN",  (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING",  (0, 0), (-1, -1), 2),
        ("RIGHTPADDING", (0, 0), (-1, -1), 2),
    ]))
    story.append(chart_row)
    story.append(Paragraph(
        "Figure 1: Trust Pillar Radar (left) and Score Comparison (right). "
        "Dashed lines indicate minimum threshold (70) and target performance (90).",
        s["caption"]))

    # Pillar detail table
    story.append(Spacer(1, 3 * mm))
    story.append(Paragraph("Pillar Score Detail", s["subsection"]))

    pw = report_data.get("pillar_weights", {
        "Safety": 0.25, "Hallucination": 0.25, "Bias": 0.20,
        "Prompt Security": 0.15, "Compliance": 0.15,
    })

    def _status(sc: float) -> tuple[str, str]:
        if sc >= 85:
            return "✓ PASS", VX.EMERALD_HEX
        if sc >= 70:
            return "⚠ CAUTION", VX.AMBER_HEX
        return "✗ FAIL", VX.ROSE_HEX

    p_header = [_th("Pillar"), _th_c("Weight"), _th_c("Score"), _th_c("Status"), _th_c("Contribution")]
    p_rows = [p_header]
    for pillar, score in pillar_scores.items():
        weight = pw.get(pillar, 0.20)
        st, sc = _status(score)
        p_rows.append([
            _td(pillar, bold=True),
            _td(f"{weight*100:.0f}%", color=VX.MID_HEX, center=True),
            _td(f"{score:.1f}", color=VX.VIOLET_HEX, bold=True, center=True),
            Paragraph(f'<b><font color="{sc}">{st}</font></b>',
                      ParagraphStyle("ps", fontName="Helvetica-Bold", fontSize=8.5,
                                     alignment=TA_CENTER)),
            _td(f"{score * weight:.2f}", color=VX.MID_HEX, center=True),
        ])

    pt = Table(p_rows, colWidths=[45 * mm, 22 * mm, 22 * mm, 32 * mm, 45 * mm], repeatRows=1)
    pt.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, 0),  VX.RL_VOID),
        ("GRID",          (0, 0), (-1, -1), 0.4, VX.RL_BORDER),
        ("ROWBACKGROUNDS",(0, 1), (-1, -1), [colors.white, VX.RL_LIGHT]),
        ("TOPPADDING",    (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("LEFTPADDING",   (0, 0), (-1, -1), 8),
    ]))
    story.append(pt)
    story.append(PageBreak())

    # ── ENFORCEMENT ──
    story.extend(_divider("3. Enforcement Engine Analysis", s))
    story.append(Paragraph(
        "The VeldrixAI Enforcement Engine applied deterministic policy decisions to all evaluated "
        "responses. The distribution below shows the breakdown of enforcement actions taken "
        "across the evaluation window. Block and Rewrite actions represent active interventions "
        "where the model's raw output did not meet policy requirements.",
        s["body"]))
    story.append(Spacer(1, 3 * mm))

    risk_dist = report_data.get("risk_distribution", {
        "Low": 7840, "Medium": 1100, "High": 312, "Critical": 48,
    })
    donut_img = Image(io.BytesIO(chart_enforcement_donut(enforcement)), width=88 * mm, height=80 * mm)
    risk_img  = Image(io.BytesIO(chart_risk_distribution(risk_dist)),   width=88 * mm, height=80 * mm)
    enforce_row = Table([[donut_img, risk_img]], colWidths=[93 * mm, 93 * mm])
    enforce_row.setStyle(TableStyle([
        ("ALIGN",  (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(enforce_row)
    story.append(Paragraph(
        "Figure 2: Enforcement Action Distribution (left) and Response Risk Distribution (right).",
        s["caption"]))

    # ── TREND ──
    story.extend(_divider("4. Trust Score Trend", s))
    trend_data = report_data.get("trend_data") or _sample_trend()
    trend_img = Image(io.BytesIO(chart_trend_line(trend_data)), width=174 * mm, height=75 * mm)
    trend_tbl = Table([[trend_img]], colWidths=[174 * mm])
    trend_tbl.setStyle(TableStyle([
        ("ALIGN",         (0, 0), (-1, -1), "CENTER"),
        ("TOPPADDING",    (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(trend_tbl)
    story.append(Paragraph(
        "Figure 3: Overall trust score trend with key pillar overlays. "
        "Amber band = caution zone (70–90). Green dashed line = target (90).",
        s["caption"]))
    story.append(PageBreak())

    # ── FINDINGS ──
    story.extend(_divider("5. Findings & Risk Assessment", s))
    findings = report_data.get("findings") or []
    story.append(_findings_table(findings))
    story.append(Spacer(1, 5 * mm))

    # ── METHODOLOGY ──
    story.extend(_divider("6. Methodology", s))
    story.append(Paragraph(
        report_data.get("methodology",
            "VeldrixAI evaluates every AI response through a five-pillar trust framework. "
            "Each pillar applies a dedicated model or heuristic: Safety uses NVIDIA NemoGuard; "
            "Hallucination uses the HHEM-2.1 model; Bias uses distilroberta-bias; "
            "Prompt Security uses NemoGuard JailbreakDetect; and Compliance uses Microsoft Presidio "
            "for PII detection alongside regulatory rule sets. Pillar scores are weighted and "
            "combined into an overall trust score, which drives enforcement decisions."),
        s["body"]))

    # ── RECOMMENDATIONS ──
    story.extend(_divider("7. Recommendations", s))
    recs = report_data.get("recommendations") or []
    for i, rec in enumerate(recs, 1):
        story.append(KeepTogether([
            Paragraph(f"{i}. {rec['title']}", s["finding"]),
            Paragraph(rec["body"], s["body_sm"]),
            Spacer(1, 3 * mm),
        ]))

    # ── APPENDIX ──
    raw = report_data.get("appendix_data")
    if raw:
        story.append(PageBreak())
        story.extend(_divider("Appendix: Raw Metrics", s))
        raw_rows = [[
            Paragraph("Metric", ParagraphStyle("th", fontName="Helvetica-Bold", fontSize=8,
                       textColor=colors.white)),
            Paragraph("Value", ParagraphStyle("th", fontName="Helvetica-Bold", fontSize=8,
                       textColor=colors.white)),
        ]]
        for k, v in raw.items():
            raw_rows.append([_td(str(k)), _td(str(v), color=VX.MID_HEX)])
        rt = Table(raw_rows, colWidths=[80 * mm, 100 * mm], repeatRows=1)
        rt.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, 0),  VX.RL_VOID),
            ("GRID",          (0, 0), (-1, -1), 0.4, VX.RL_BORDER),
            ("ROWBACKGROUNDS",(0, 1), (-1, -1), [colors.white, VX.RL_LIGHT]),
            ("TOPPADDING",    (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("LEFTPADDING",   (0, 0), (-1, -1), 8),
        ]))
        story.append(rt)

    doc.build(story, onFirstPage=tpl.first_page, onLaterPages=tpl.later_pages)
    return buf.getvalue()
