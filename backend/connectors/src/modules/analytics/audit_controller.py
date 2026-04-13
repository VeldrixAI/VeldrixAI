"""Audit trails controller — paginated list, detail, and Groq-powered intelligence."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from typing import Any, Dict, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from uuid import UUID
import io, csv

from src.db.base import get_db
from src.core.middleware.auth import get_current_user
from src.modules.reports.models import AuditTrail

router = APIRouter(prefix="/api/audit-trails", tags=["audit-trails"])
logger = logging.getLogger("veldrix.audit")


# ── Simple in-memory intelligence cache (24 hr TTL) ──────────────────────────
_intelligence_cache: dict[str, tuple[dict, float]] = {}
_CACHE_TTL = 86400.0  # 24 hours

# ── Per-org rate limit: max 5 Groq calls / 60 s ──────────────────────────────
_rate_tracker: dict[str, list[float]] = {}
_RATE_WINDOW = 60.0
_RATE_MAX = 5


# ── Groq intelligence prompt ──────────────────────────────────────────────────

INTELLIGENCE_SYSTEM_PROMPT = """
You are the VeldrixAI Audit Intelligence Engine — an elite AI governance analyst embedded
in a real-time trust infrastructure platform. Your role is to produce forensic-grade audit
intelligence for enterprise AI operators, compliance teams, and security engineers.

You will receive structured analysis data from a single AI request that was intercepted
and evaluated by the VeldrixAI trust platform. Your job is to produce two outputs:

1. RISK THESIS — A precise, forensic narrative (3–4 paragraphs) that explains:
   - What the evaluated AI request was doing and why it triggered the trust evaluation
   - Which specific trust pillars were most affected and why those scores indicate risk
   - The enforcement action taken and whether it was proportionate
   - The systemic risk pattern this request represents (isolated incident vs. drift signal)

2. RECOMMENDATIONS — 4–5 concrete, actionable recommendations for the operator.
   Each recommendation must:
   - Reference the specific pillar score or flag that motivates it
   - Be immediately actionable (what to configure, monitor, or escalate)
   - Be calibrated to the severity (don't recommend escalation for low-risk scores)

TONE: Authoritative. Precise. No hedging. No generic advice. Every sentence must be grounded
in the specific data you received. Do not invent data. Do not speculate beyond the scores.

OUTPUT FORMAT — Respond ONLY with valid JSON, no markdown, no preamble:
{
  "risk_thesis": {
    "headline": "One sentence that captures the core finding",
    "severity_level": "LOW | MEDIUM | HIGH | CRITICAL",
    "narrative": "Full 3–4 paragraph forensic analysis",
    "primary_pillar_at_risk": "The pillar with highest concern",
    "risk_pattern": "ISOLATED | RECURRING | DRIFT_SIGNAL | SYSTEMIC"
  },
  "recommendations": [
    {
      "priority": "IMMEDIATE | SHORT_TERM | MONITORING",
      "pillar": "Which trust pillar this addresses",
      "action": "Specific action to take",
      "rationale": "Why this is necessary given the scores"
    }
  ],
  "confidence_assessment": {
    "evaluation_confidence": "HIGH | MEDIUM | LOW",
    "notes": "Any caveats about data completeness or model confidence"
  }
}
"""


def _build_intelligence_prompt(record: AuditTrail) -> str:
    meta: dict = record.action_metadata or {}

    # Pillar scores in telemetry are 0-1 where higher = safer.
    # Convert to risk scores (0.0 = clean, 1.0 = critical) for the Groq prompt.
    pillar_scores: dict = meta.get("pillar_scores", {})

    def risk(key: str) -> str:
        v = pillar_scores.get(key)
        if v is None:
            return "N/A"
        return f"{round(1.0 - float(v), 3)}"

    overall_trust = meta.get("overall_score")
    overall_risk = f"{round(1.0 - float(overall_trust), 3)}" if overall_trust is not None else "N/A"

    verdict = meta.get("verdict", record.action_type.upper())
    flags = meta.get("critical_flags", []) + meta.get("all_flags", [])
    flags = list(dict.fromkeys(flags))  # dedupe, preserve order

    prompt_excerpt = meta.get("prompt_preview") or "[not available]"
    response_excerpt = meta.get("response_preview") or "[not available]"

    return f"""
REQUEST AUDIT DATA:
- Request ID: {record.request_id or str(record.id)}
- Timestamp: {record.created_at.isoformat() if record.created_at else 'N/A'}
- Model Used: {meta.get('model', 'N/A')}
- Enforcement Action Applied: {verdict}
- Latency (ms): {meta.get('total_latency_ms', 'N/A')}
- SDK Version: {meta.get('sdk_version', 'N/A')}

TRUST PILLAR SCORES (0.0 = clean, 1.0 = critical risk):
- Safety & Toxicity Score: {risk('safety')}
- Hallucination Risk Score: {risk('hallucination')}
- Bias & Fairness Score: {risk('bias')}
- Prompt Security Score: {risk('prompt_security')}
- PII / Compliance Score: {risk('compliance')}
- Overall Risk Score: {overall_risk}

FLAGS TRIGGERED: {flags}
ENFORCEMENT CONFIDENCE: HIGH
ACTOR: {record.actor or 'Unknown'}

PROMPT EXCERPT (first 300 chars): {str(prompt_excerpt)[:300]}
RESPONSE EXCERPT (first 300 chars): {str(response_excerpt)[:300]}

Produce the forensic risk thesis and recommendations for this exact request.
"""


async def _call_groq(prompt: str) -> dict:
    groq_key = os.getenv("GROQ_API_KEY")
    if not groq_key:
        raise RuntimeError("GROQ_API_KEY not configured")

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {groq_key}", "Content-Type": "application/json"},
            json={
                "model": "llama-3.3-70b-versatile",
                "messages": [
                    {"role": "system", "content": INTELLIGENCE_SYSTEM_PROMPT},
                    {"role": "user", "content": prompt},
                ],
                "temperature": 0.3,
                "max_tokens": 1800,
                "response_format": {"type": "json_object"},
            },
        )
        resp.raise_for_status()
        data = resp.json()
        return json.loads(data["choices"][0]["message"]["content"])


async def _get_intelligence(request_id: str, record: AuditTrail, force: bool = False) -> dict:
    now = time.time()
    if not force and request_id in _intelligence_cache:
        cached, cached_at = _intelligence_cache[request_id]
        if now - cached_at < _CACHE_TTL:
            return {**cached, "cached": True}

    try:
        prompt = _build_intelligence_prompt(record)
        result = await asyncio.wait_for(_call_groq(prompt), timeout=25.0)
        _intelligence_cache[request_id] = (result, now)
        return {**result, "cached": False}
    except asyncio.TimeoutError:
        return {
            "error": True,
            "error_code": "TIMEOUT",
            "message": "Intelligence generation timed out. Please retry.",
            "risk_thesis": None,
            "recommendations": [],
        }
    except Exception as exc:
        logger.error("intelligence groq call failed request_id=%s: %s", request_id, exc)
        return {
            "error": True,
            "error_code": "GROQ_ERROR",
            "message": f"Intelligence service unavailable: {str(exc)[:100]}",
            "risk_thesis": None,
            "recommendations": [],
        }


def _check_rate_limit(org_id: str) -> bool:
    """Returns True if call is allowed, False if rate limited."""
    now = time.time()
    calls = _rate_tracker.get(org_id, [])
    calls = [t for t in calls if now - t < _RATE_WINDOW]
    if len(calls) >= _RATE_MAX:
        _rate_tracker[org_id] = calls
        return False
    calls.append(now)
    _rate_tracker[org_id] = calls
    return True


# ── Internal endpoint (called from core service telemetry) ───────────────────

class InternalAuditRequest(BaseModel):
    action_type: str
    entity_type: Optional[str] = None
    entity_id: Optional[str] = None
    user_id: Optional[str] = None
    actor_email: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


@router.post("/internal/audit-trail", status_code=201, include_in_schema=False)
def internal_log_audit(body: InternalAuditRequest, db: Session = Depends(get_db)):
    """Internal service-to-service audit logging. Called from core service."""
    meta = body.metadata or {}
    request_id = meta.get("request_id")
    actor = body.actor_email or body.user_id
    logger.warning("internal_log_audit: saving request_id=%s user_id=%s actor=%s", request_id, body.user_id, actor)
    entry = AuditTrail(
        user_id=UUID(body.user_id) if body.user_id else None,
        action_type=body.action_type,
        entity_type=body.entity_type,
        entity_id=UUID(body.entity_id) if body.entity_id else None,
        action_metadata=meta,
        log_type="EVALUATION",
        request_id=request_id,
        actor=actor,
    )
    db.add(entry)
    try:
        db.commit()
        logger.warning("internal_log_audit: saved OK request_id=%s db_id=%s", request_id, entry.id)
    except Exception as exc:
        db.rollback()
        logger.error("internal_log_audit: DB commit FAILED request_id=%s: %s", request_id, exc)
        raise HTTPException(status_code=500, detail=f"Audit trail persist failed: {exc}")
    return {"ok": True, "id": str(entry.id)}


# ── Public write endpoint ─────────────────────────────────────────────────────

class LogAuditRequest(BaseModel):
    action_type: str
    entity_type: Optional[str] = None
    entity_id: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    log_type: Optional[str] = "EVALUATION"
    related_request_id: Optional[str] = None
    actor: Optional[str] = None


@router.post("/", status_code=201)
async def log_audit_entry(
    body: LogAuditRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    uid = UUID(current_user["id"])
    meta = body.metadata or {}
    request_id = meta.get("request_id")
    entry = AuditTrail(
        user_id=uid,
        action_type=body.action_type,
        entity_type=body.entity_type,
        entity_id=UUID(body.entity_id) if body.entity_id else None,
        action_metadata=meta,
        log_type=body.log_type or "EVALUATION",
        request_id=request_id,
        related_request_id=body.related_request_id,
        actor=body.actor or current_user.get("email"),
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return {"id": str(entry.id)}


# ── List endpoint ─────────────────────────────────────────────────────────────

@router.get("/")
async def list_audit_trails(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    action_type: str = Query(None),
    log_type: str = Query(None),
    search: str = Query(None),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    uid = current_user["id"]
    from sqlalchemy import or_
    q = db.query(AuditTrail).filter(
        or_(AuditTrail.user_id == uid, AuditTrail.user_id.is_(None))
    )

    if action_type:
        q = q.filter(AuditTrail.action_type == action_type)
    if log_type:
        q = q.filter(AuditTrail.log_type == log_type)
    if search:
        q = q.filter(AuditTrail.action_type.ilike(f"%{search}%"))

    total = q.count()
    records = q.order_by(AuditTrail.created_at.desc()).offset((page - 1) * limit).limit(limit).all()

    return {
        "total": total,
        "page": page,
        "limit": limit,
        "records": [_serialize(r) for r in records],
    }


# ── Detail endpoint ───────────────────────────────────────────────────────────

@router.get("/{request_id}/detail")
async def get_audit_detail(
    request_id: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return the full audit record for a given request_id, scoped to the caller."""
    uid = current_user["id"]
    from sqlalchemy import or_
    logger.warning("get_audit_detail: looking up request_id=%s uid=%s", request_id, uid)

    # 1. Try request_id column (fast index lookup — works for records after migration 006)
    try:
        record = (
            db.query(AuditTrail)
            .filter(
                AuditTrail.request_id == request_id,
                or_(AuditTrail.user_id == uid, AuditTrail.user_id.is_(None)),
            )
            .order_by(AuditTrail.created_at.desc())
            .first()
        )
        logger.warning("get_audit_detail: request_id column lookup -> %s", "FOUND" if record else "miss")
    except Exception as exc:
        logger.error("get_audit_detail: request_id column lookup FAILED: %s", exc)
        record = None

    # 2. Fallback: look up by primary key UUID (used when frontend navigates
    #    with the DB record id instead of the SDK request_id).
    if not record:
        try:
            record = (
                db.query(AuditTrail)
                .filter(
                    AuditTrail.id == request_id,
                    or_(AuditTrail.user_id == uid, AuditTrail.user_id.is_(None)),
                )
                .first()
            )
            logger.warning("get_audit_detail: primary key lookup -> %s", "FOUND" if record else "miss")
        except Exception as exc:
            logger.error("get_audit_detail: primary key lookup FAILED: %s", exc)

    # 3. JSONB fallback: for pre-migration rows where request_id column is NULL
    #    but the value exists nested in action_metadata.
    if not record:
        try:
            record = (
                db.query(AuditTrail)
                .filter(
                    AuditTrail.action_metadata["request_id"].astext == request_id,
                    or_(AuditTrail.user_id == uid, AuditTrail.user_id.is_(None)),
                )
                .order_by(AuditTrail.created_at.desc())
                .first()
            )
            logger.warning("get_audit_detail: JSONB fallback -> %s", "FOUND" if record else "miss")
        except Exception as exc:
            logger.error("get_audit_detail: JSONB fallback FAILED: %s", exc)

    if not record:
        # Debug: check if record exists under any user to detect user_id mismatch vs missing record
        try:
            from sqlalchemy import or_ as _or
            any_r = (
                db.query(AuditTrail)
                .filter(
                    _or(
                        AuditTrail.request_id == request_id,
                        AuditTrail.action_metadata["request_id"].astext == request_id,
                    )
                )
                .first()
            )
            if any_r:
                logger.warning(
                    "get_audit_detail: record EXISTS but user_id MISMATCH — stored=%s caller=%s — returning it",
                    any_r.user_id, uid,
                )
                return _serialize(any_r)
        except Exception as exc:
            logger.error("get_audit_detail: unscoped fallback error: %s", exc)
        logger.warning("get_audit_detail: NOT FOUND in DB at all for request_id=%s uid=%s", request_id, uid)
        raise HTTPException(status_code=404, detail="Audit record not found")
    return _serialize(record)


# ── Intelligence endpoint (Groq-powered) ──────────────────────────────────────

@router.post("/{request_id}/intelligence")
async def get_audit_intelligence(
    request_id: str,
    force_refresh: bool = Query(False),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Generate (or return cached) Groq-powered forensic intelligence for a request.
    POST because it may trigger a Groq API call (side effect).
    """
    uid = current_user["id"]
    from sqlalchemy import or_
    record = (
        db.query(AuditTrail)
        .filter(
            AuditTrail.request_id == request_id,
            or_(AuditTrail.user_id == uid, AuditTrail.user_id.is_(None)),
        )
        .order_by(AuditTrail.created_at.desc())
        .first()
    )
    if not record:
        try:
            record = (
                db.query(AuditTrail)
                .filter(
                    AuditTrail.id == request_id,
                    or_(AuditTrail.user_id == uid, AuditTrail.user_id.is_(None)),
                )
                .first()
            )
        except Exception:
            pass
    if not record:
        # Second fallback: JSONB search for pre-migration rows where the
        # request_id column is NULL but action_metadata contains the value.
        try:
            record = (
                db.query(AuditTrail)
                .filter(
                    AuditTrail.action_metadata["request_id"].astext == request_id,
                    or_(AuditTrail.user_id == uid, AuditTrail.user_id.is_(None)),
                )
                .order_by(AuditTrail.created_at.desc())
                .first()
            )
        except Exception:
            pass
    if not record:
        raise HTTPException(status_code=404, detail="Audit record not found")

    # Return cached result immediately without rate-limit check
    if not force_refresh and request_id in _intelligence_cache:
        cached, cached_at = _intelligence_cache[request_id]
        if time.time() - cached_at < _CACHE_TTL:
            return {**cached, "cached": True}

    # Rate limit check (per user, keyed by user_id)
    if not _check_rate_limit(uid):
        if request_id in _intelligence_cache:
            cached, _ = _intelligence_cache[request_id]
            return {**cached, "cached": True, "rate_limited": True}
        return {
            "error": True,
            "error_code": "RATE_LIMITED",
            "message": "Intelligence rate limit reached. Please wait 60 seconds.",
            "risk_thesis": None,
            "recommendations": [],
            "rate_limited": True,
        }

    result = await _get_intelligence(request_id, record, force=force_refresh)
    return result


# ── Immutability guard ────────────────────────────────────────────────────────

@router.delete("/{log_id}")
async def delete_audit_log(log_id: str):
    raise HTTPException(
        status_code=403,
        detail="Audit log entries are immutable and cannot be deleted. This is by design.",
    )


# ── CSV export endpoint ───────────────────────────────────────────────────────

@router.get("/export")
async def export_csv(
    action_type: str = Query(None),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    uid = current_user["id"]
    from sqlalchemy import or_
    q = db.query(AuditTrail).filter(
        or_(AuditTrail.user_id == uid, AuditTrail.user_id.is_(None))
    )
    if action_type:
        q = q.filter(AuditTrail.action_type == action_type)
    records = q.order_by(AuditTrail.created_at.desc()).limit(1000).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["ID", "Request ID", "Log Type", "Action", "Entity Type", "Entity ID", "Actor", "IP", "Timestamp"])
    for r in records:
        writer.writerow([
            str(r.id),
            r.request_id or "",
            r.log_type or "",
            r.action_type,
            r.entity_type or "",
            str(r.entity_id) if r.entity_id else "",
            r.actor or "",
            r.ip_address or "",
            r.created_at.isoformat() if r.created_at else "",
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=audit-trails.csv"},
    )


# ── Serializer ────────────────────────────────────────────────────────────────

def _serialize(r: AuditTrail) -> dict:
    meta = r.action_metadata or {}
    return {
        "id": str(r.id),
        "action_type": r.action_type,
        "log_type": r.log_type or "EVALUATION",
        "entity_type": r.entity_type,
        "entity_id": str(r.entity_id) if r.entity_id else None,
        "metadata": meta,
        "ip_address": r.ip_address,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "request_id": r.request_id or meta.get("request_id"),
        "related_request_id": r.related_request_id,
        "actor": r.actor,
        # Convenience fields surfaced from metadata for UI
        "verdict": meta.get("verdict"),
        "overall_score": meta.get("overall_score"),
        "total_latency_ms": meta.get("total_latency_ms"),
        "pillar_scores": meta.get("pillar_scores"),
        "critical_flags": meta.get("critical_flags", []),
    }
