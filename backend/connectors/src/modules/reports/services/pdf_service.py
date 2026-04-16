"""
VeldrixAI PDF Service
Generates branded PDF reports with NVIDIA NIM-powered narrative intelligence.
"""
import os
import json
import logging
from datetime import datetime
from typing import Any, Dict, Optional
import httpx
from src.modules.reports.services.pdf_generator import generate_veldrix_pdf

logger = logging.getLogger(__name__)

_NIM_BASE    = os.getenv("NVIDIA_API_BASE_URL", "https://integrate.api.nvidia.com/v1")
_NIM_KEY     = os.getenv("NVIDIA_API_KEY", "")
_NIM_MODEL   = "meta/llama-3.1-8b-instruct"
_NIM_TIMEOUT = int(os.getenv("VELDRIX_NIM_TIMEOUT_MS", "30000")) / 1000
_PASS = 85.0
_WARN = 70.0

# Mapping from flat audit log keys to display names
_PILLAR_NAME_MAP = {
    "safety": "Safety",
    "hallucination": "Hallucination & Factual Integrity",
    "bias": "Bias & Ethics Analysis",
    "prompt_security": "Policy Violation & Prompt Security",
    "compliance": "Legal Exposure & Compliance",
}

# ── NIM narrative generator ──────────────────────────────────────────────────
def _nim_narrative(report_data: Dict[str, Any]) -> Optional[Dict]:
    """
    Call NVIDIA NIM to generate executive summary, findings descriptions,
    and recommendations based on real pillar scores.
    Returns dict with keys: executive_summary, findings_narrative, recommendations
    or None on failure (caller falls back to static).
    """
    if not _NIM_KEY:
        return None

    pillar_scores  = report_data.get("pillar_scores", {})
    pillar_weights = report_data.get("pillar_weights", {})
    overall        = report_data.get("overall_score", 0)
    risk_level     = report_data.get("risk_level", "UNKNOWN")
    model_name     = report_data.get("model_name", "Unknown Model")
    enforcement    = report_data.get("enforcement_actions", {})
    flags_map      = report_data.get("flags_map", {})

    pillar_lines = "\n".join(
        f"  - {name}: {score:.1f}/100 (weight {pillar_weights.get(name, 0)*100:.0f}%)"
        + (f" | flags: {', '.join(flags_map.get(name, [])[:3])}" if flags_map.get(name) else "")
        for name, score in pillar_scores.items()
    )
    enforcement_lines = ", ".join(f"{k}: {v}" for k, v in enforcement.items())

    prompt = f"""You are the VeldrixAI Governance Intelligence Engine - an expert AI safety auditor.
Generate a professional, data-driven governance report narrative based on these real evaluation results.

EVALUATION DATA:
- Model Evaluated: {model_name}
- Overall Trust Score: {overall:.1f}/100
- Risk Classification: {risk_level}
- Enforcement Actions: {enforcement_lines}
- Pillar Scores:
{pillar_lines}

Generate a JSON object with EXACTLY these keys:
{{
  "executive_summary": "3 concise paragraphs. Paragraph 1: overall score context and what it means for production safety. Paragraph 2: which pillars passed/failed and why it matters. Paragraph 3: immediate business impact and urgency. Be specific about the numbers. Authoritative tone like a Big Four AI audit firm.",
  "recommendations": [
    {{"title": "Short action title (max 8 words)", "body": "Specific, actionable 2-3 sentence recommendation referencing the actual score"}},
    ... (3-5 recommendations, prioritised by severity - only for pillars that need attention)
  ]
}}

Rules:
- Reference actual scores by number (e.g. "Safety scored 91.2/100")
- No marketing language, no vague advice
- Recommendations must be specific and implementable
- If all pillars passed, give 1 maintenance recommendation
- Output ONLY valid JSON, no preamble, no markdown fences"""

    try:
        resp = httpx.post(
            f"{_NIM_BASE}/chat/completions",
            json={
                "model": _NIM_MODEL,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.2,
                "max_tokens": 900,
            },
            headers={"Authorization": f"Bearer {_NIM_KEY}", "Content-Type": "application/json"},
            timeout=_NIM_TIMEOUT,
        )
        resp.raise_for_status()
        raw = resp.json()["choices"][0]["message"]["content"].strip()

        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        raw = raw.strip()

        return json.loads(raw)
    except Exception as e:
        logger.warning("NIM narrative generation failed: %s - falling back to static", e)
        return None


# ── Static fallback findings/recs (used when NIM unavailable) ────────────────

_PILLAR_META: Dict[str, Dict] = {
    "Safety": {
        "fail_sev": "CRITICAL", "warn_sev": "HIGH",
        "finding_fail": "Content safety score critically low ({score:.1f}/100). Harmful or policy-violating responses detected.",
        "finding_warn": "Content safety below target ({score:.1f}/100). Borderline harmful content present.",
        "finding_pass": "No harmful content detected. Content safety checks passed.",
        "rec_fail": "Enable hard-block enforcement on Content Risk pillar at threshold 0.85. Audit flagged responses immediately.",
        "rec_warn": "Lower soft-block threshold to 0.80 and enable rewriting for borderline cases.",
    },
    "Content Risk Analysis": {
        "fail_sev": "CRITICAL", "warn_sev": "HIGH",
        "finding_fail": "Content safety score critically low ({score:.1f}/100). Harmful or policy-violating responses detected.",
        "finding_warn": "Content safety below target ({score:.1f}/100). Borderline harmful content present.",
        "finding_pass": "No harmful content detected. Content safety checks passed.",
        "rec_fail": "Enable hard-block enforcement on Content Risk pillar at threshold 0.85. Audit flagged responses immediately.",
        "rec_warn": "Lower soft-block threshold to 0.80 and enable rewriting for borderline cases.",
    },
    "Hallucination & Factual Integrity": {
        "fail_sev": "HIGH", "warn_sev": "MEDIUM",
        "finding_fail": "Hallucination risk high ({score:.1f}/100). Factually unreliable responses at significant rate.",
        "finding_warn": "Hallucination risk elevated ({score:.1f}/100). Some unverified claims present.",
        "finding_pass": "Factual integrity checks passed. Low hallucination risk.",
        "rec_fail": "Deploy RAG layer to ground responses. Enable hallucination hard-block for high-stakes queries.",
        "rec_warn": "Add RAG grounding for knowledge-intensive queries. Surface confidence scores to end-users.",
    },
    "Bias & Ethics Analysis": {
        "fail_sev": "HIGH", "warn_sev": "MEDIUM",
        "finding_fail": "Bias score critically low ({score:.1f}/100). Significant demographic bias or ethical violations.",
        "finding_warn": "Bias below target ({score:.1f}/100). Measurable demographic bias in some responses.",
        "finding_pass": "No significant bias or ethical violations detected.",
        "rec_fail": "Block/rewrite biased responses immediately. Initiate bias audit across demographic groups.",
        "rec_warn": "Enable bias-aware rewriting. Conduct quarterly bias audits.",
    },
    "Policy Violation & Prompt Security": {
        "fail_sev": "CRITICAL", "warn_sev": "HIGH",
        "finding_fail": "Policy/security score critically low ({score:.1f}/100). Prompt injection or serious violations detected.",
        "finding_warn": "Policy compliance below target ({score:.1f}/100). Signs of prompt manipulation.",
        "finding_pass": "No prompt injection or policy violations detected.",
        "rec_fail": "Enable hard-block on all injection patterns immediately. Tighten policy context.",
        "rec_warn": "Enable soft-block with human review for borderline violations.",
    },
    "Legal Exposure & Compliance": {
        "fail_sev": "HIGH", "warn_sev": "MEDIUM",
        "finding_fail": "Legal/compliance score critically low ({score:.1f}/100). PII leakage or regulatory violations.",
        "finding_warn": "Legal exposure below target ({score:.1f}/100). Responses may carry regulatory risk.",
        "finding_pass": "No significant legal exposure or compliance violations.",
        "rec_fail": "Enable PII auto-masking immediately. Block high legal-risk responses.",
        "rec_warn": "Enable disclaimer injection and PII masking for email/phone/ID patterns.",
    },
}
_PILLAR_META_DEFAULT = {
    "fail_sev": "MEDIUM", "warn_sev": "LOW",
    "finding_fail": "Pillar score below threshold ({score:.1f}/100).",
    "finding_warn": "Pillar score below target ({score:.1f}/100).",
    "finding_pass": "Pillar checks passed.",
    "rec_fail": "Investigate pillar failures and review flagged responses.",
    "rec_warn": "Monitor this pillar and review borderline responses.",
}


def _static_findings_and_recs(
    pillar_scores: Dict[str, float],
    pillar_weights: Dict[str, float],
    pillar_results: Dict[str, Any],
    overall: float,
    risk_level: str,
) -> tuple:
    findings, recommendations = [], []
    flags_map = {
        pdata.get("metadata", {}).get("name", pid): pdata.get("flags", [])
        for pid, pdata in pillar_results.items()
    }
    for name, score in pillar_scores.items():
        meta = _PILLAR_META.get(name, _PILLAR_META_DEFAULT)
        flags_str = f" Flags: {', '.join(flags_map.get(name, [])[:4])}" if flags_map.get(name) else ""
        if score < _WARN:
            sev, desc, rec = meta["fail_sev"], meta["finding_fail"].format(score=score) + flags_str, meta["rec_fail"]
        elif score < _PASS:
            sev, desc, rec = meta["warn_sev"], meta["finding_warn"].format(score=score) + flags_str, meta["rec_warn"]
        else:
            sev, desc, rec = "PASS", meta["finding_pass"] + flags_str, None
        findings.append({"pillar": name, "severity": sev, "description": desc,
                         "action": rec or "Continue monitoring. No immediate action required."})
        if rec:
            recommendations.append({
                "title": f"{'[CRITICAL] ' if sev == 'CRITICAL' else ''}{name} - {sev.title()} Risk",
                "body": rec,
            })
    if risk_level in ("HIGH_RISK", "CRITICAL"):
        recommendations.insert(0, {
            "title": "Immediate Action Required - Trust Score Below Safe Threshold",
            "body": (f"Overall trust score {overall:.1f}/100 classified as {risk_level.replace('_', ' ')}. "
                     "Do not deploy without human review. Enforce hard-block below 70 on critical pillars."),
        })
    if not recommendations:
        recommendations.append({
            "title": "Maintain Current Governance Configuration",
            "body": (f"All pillars passed with overall score {overall:.1f}/100. "
                     "Continue monitoring. Schedule quarterly audits as usage scales."),
        })
    return findings, recommendations


# ── Main PDF service ──────────────────────────────────────────────────────────

class PDFService:
    @staticmethod
    def generate_report_pdf(
        title: str,
        report_type: str,
        input_payload: Dict[str, Any],
        output_summary: str,
        created_at: datetime,
        report_name: str = "Cobalt Nexus",
        vx_report_id: str = "VX-00000000-0000",
        tenant: str = "VeldrixAI Platform",
    ) -> bytes:
        result         = (input_payload or {}).get("result", {})
        final_score    = result.get("final_score") or {}
        pillar_results = result.get("pillar_results") or {}

        # Build pillar scores + weights from nested evaluation data
        pillar_scores: Dict[str, float] = {}
        pillar_weights: Dict[str, float] = {}
        flags_map: Dict[str, list] = {}
        for pid, pdata in pillar_results.items():
            name = pdata.get("metadata", {}).get("name", pid)
            raw  = pdata.get("score", {})
            val  = raw.get("value", 0) if isinstance(raw, dict) else float(raw or 0)
            pillar_scores[name]  = round(float(val), 1)
            w = pdata.get("metadata", {}).get("weight", 0.20)
            pillar_weights[name] = float(w) if float(w) <= 1.0 else float(w) / 100.0
            flags_map[name]      = pdata.get("flags", [])

        # ── Flat audit log metadata fallback ──────────────────────────────────
        # When input_payload comes directly from an audit log row, the structure
        # is flat: { verdict, overall_score, pillar_scores: {safety: 0.95, ...} }
        # instead of nested under result.final_score / result.pillar_results.
        if not pillar_scores:
            flat_scores = (input_payload or {}).get("pillar_scores", {})
            for k, v in flat_scores.items():
                name = _PILLAR_NAME_MAP.get(str(k).lower(), str(k).replace("_", " ").title())
                pillar_scores[name]  = round(float(v) * 100, 1)
                pillar_weights[name] = 0.20

        # Overall score: prefer nested, then flat (0-1 range → ×100), then derive
        raw_overall = final_score.get("value")
        overall = round(float(raw_overall), 1) if raw_overall is not None else None
        if overall is None:
            flat_overall = (input_payload or {}).get("overall_score")
            if flat_overall is not None:
                overall = round(float(flat_overall) * 100, 1)
        if overall is None and pillar_scores:
            overall = round(sum(pillar_scores[p] * pillar_weights.get(p, 0.2) for p in pillar_scores), 1)
        overall = overall or 0.0

        # Risk level: prefer nested, then derive from flat verdict
        risk_level = str(final_score.get("risk_level", "")).upper()
        if not risk_level:
            flat_verdict = str((input_payload or {}).get("verdict", "")).lower()
            risk_level = {
                "safe": "LOW",
                "low": "LOW",
                "high_risk": "HIGH_RISK",
                "high": "HIGH_RISK",
                "critical": "CRITICAL",
                "review_required": "MEDIUM",
                "warn": "HIGH_RISK",
            }.get(flat_verdict, "UNKNOWN")

        enforcement_action = final_score.get("enforcement_action", "")
        if str(enforcement_action).upper() in ("BLOCK", "BLOCKED") or risk_level in ("HIGH_RISK", "HIGH", "CRITICAL"):
            enforcement = {"Allow": 0, "Block": 1, "Rewrite": 0}
        else:
            enforcement = {"Allow": 1, "Block": 0, "Rewrite": 0}

        model      = (input_payload or {}).get("model", "-")
        provider   = (input_payload or {}).get("provider", "")
        model_name = f"{model} ({provider})" if provider else model

        # ── Try NIM narrative first ──
        nim_result = _nim_narrative({
            "pillar_scores":       pillar_scores,
            "pillar_weights":      pillar_weights,
            "overall_score":       overall,
            "risk_level":          risk_level,
            "model_name":          model_name,
            "enforcement_actions": enforcement,
            "flags_map":           flags_map,
        })

        if nim_result:
            executive_summary = nim_result.get("executive_summary", "")
            nim_recs = nim_result.get("recommendations", [])
            findings, static_recs = _static_findings_and_recs(
                pillar_scores, pillar_weights, pillar_results, overall, risk_level
            )
            recommendations = nim_recs if nim_recs else static_recs
        else:
            findings, recommendations = _static_findings_and_recs(
                pillar_scores, pillar_weights, pillar_results, overall, risk_level
            )
            executive_summary = output_summary or (
                "This report presents the trust evaluation results for the specified AI model "
                "response, evaluated against the VeldrixAI five-pillar governance framework. "
                "Each pillar was assessed independently using dedicated detection models and "
                "heuristics, with results combined into a weighted overall trust score."
            )

        report_data = {
            "report_name":         report_name,
            "vx_report_id":        vx_report_id,
            "title":               title or "AI Model Trust Evaluation Report",
            "subtitle":            "Deep Research Analysis · VeldrixAI Runtime Evaluation",
            "report_type":         report_type.replace("_", " ").title(),
            "generated_at":        created_at.strftime("%B %d, %Y %H:%M UTC"),
            "model_name":          model_name,
            "eval_window":         "Single Evaluation",
            "total_evals":         1,
            "tenant":              tenant,
            "pillar_version":      "v2.1.0",
            "overall_score":       overall,
            "pillar_scores":       pillar_scores or {},
            "pillar_weights":      pillar_weights or {
                "Safety": 0.25,
                "Hallucination & Factual Integrity": 0.25,
                "Bias & Ethics Analysis": 0.20,
                "Policy Violation & Prompt Security": 0.15,
                "Legal Exposure & Compliance": 0.15,
            },
            "enforcement_actions": enforcement,
            "findings":            findings,
            "recommendations":     recommendations,
            "executive_summary":   executive_summary,
        }

        return generate_veldrix_pdf(report_data)