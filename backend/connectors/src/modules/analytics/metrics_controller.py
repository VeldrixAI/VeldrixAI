"""
GET  /api/metrics/pillars?window=7d  — per-pillar P/R/F1/FPR/MCC/ECE with Wilson CI
GET  /api/metrics/correlations       — pillar co-fire Pearson correlations
POST /api/metrics/feedback           — SDK feedback ingestion → writes audit_log_labels

Never mocks. Never falls back to global aggregates.
If n < 30 for a pillar → returns status=insufficient_data with honest message.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy.dialects.postgresql import insert as pg_insert

from src.db.base import get_db
from src.core.middleware.auth import get_current_user
from src.modules.reports.models import AuditTrail, AuditLogLabel
from src.modules.analytics.metrics_service import (
    pillar_metrics_service,
    PILLAR_NAMES,
    PillarMetrics,
    InsufficientDataResult,
)

router = APIRouter(prefix="/api/metrics", tags=["metrics"])
logger = logging.getLogger("veldrix.metrics")


# ── Serializers ───────────────────────────────────────────────────────────────

def _serialize_metrics(m: PillarMetrics | InsufficientDataResult) -> dict:
    if isinstance(m, InsufficientDataResult):
        return {
            "pillar":       m.pillar,
            "status":       m.status,
            "labeled_n":    m.labeled_n,
            "required_n":   m.required_n,
            "message":      m.message,
            "window_days":  m.window_days,
        }
    return {
        "pillar":       m.pillar,
        "status":       m.status,
        "labeled_n":    m.labeled_n,
        "window_days":  m.window_days,
        "precision":    m.precision,
        "recall":       m.recall,
        "f1":           m.f1,
        "fpr":          m.fpr,
        "specificity":  m.specificity,
        "mcc":          m.mcc,
        "ece":          m.ece,
        "precision_ci": {"lower": m.precision_ci.lower, "upper": m.precision_ci.upper},
        "recall_ci":    {"lower": m.recall_ci.lower,    "upper": m.recall_ci.upper},
        "confusion":    {"tp": m.tp, "fp": m.fp, "fn": m.fn, "tn": m.tn},
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/pillars")
def get_pillar_metrics(
    window: str = Query("7d", description="Time window: 1d | 7d | 30d"),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    GET /api/metrics/pillars?window=7d

    Returns per-pillar P/R/F1/FPR/Specificity/MCC/ECE with Wilson 95% CI.
    Pillars with < 30 labeled evaluations return status=insufficient_data.

    Never mocks. Never falls back to global aggregates.
    """
    window_days = _parse_window(window)
    uid = current_user["id"]

    results = []
    for pillar in PILLAR_NAMES:
        m = pillar_metrics_service.compute_pillar_metrics(
            db=db,
            user_id=uid,
            pillar=pillar,
            window_days=window_days,
        )
        results.append(_serialize_metrics(m))

    return {
        "pillars":       results,
        "window_days":   window_days,
        "computed_at":   datetime.now(timezone.utc).isoformat(),
    }


@router.get("/correlations")
def get_pillar_correlations(
    window: str = Query("30d"),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    GET /api/metrics/correlations?window=30d

    Pearson correlation coefficients between all pillar pairs, computed from
    audit_trails JSONB. Used to weight edges in the Trust Constellation.
    Returns null for pairs where correlation cannot be computed.
    """
    window_days = _parse_window(window)
    uid = current_user["id"]

    corr = pillar_metrics_service.compute_pillar_correlations(
        db=db,
        user_id=uid,
        window_days=window_days,
    )

    return {
        "correlations": {
            "safety_hallucination":          corr.safety_hallucination,
            "safety_bias":                   corr.safety_bias,
            "safety_prompt_security":        corr.safety_prompt_security,
            "safety_compliance":             corr.safety_compliance,
            "hallucination_bias":            corr.hallucination_bias,
            "hallucination_prompt_security": corr.hallucination_prompt_security,
            "hallucination_compliance":      corr.hallucination_compliance,
            "bias_prompt_security":          corr.bias_prompt_security,
            "bias_compliance":               corr.bias_compliance,
            "prompt_security_compliance":    corr.prompt_security_compliance,
        },
        "n":          corr.n,
        "window_days": window_days,
    }


@router.get("/latency")
def get_pillar_latency(
    window: str = Query("7d"),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    GET /api/metrics/latency?window=7d

    p50/p95/p99/p999 per pillar from audit_log_labels.pillar_latency_ms.
    Uses PostgreSQL percentile_cont — never computes in Python.
    """
    window_days = _parse_window(window)
    uid = current_user["id"]

    results = []
    for pillar in PILLAR_NAMES:
        lp = pillar_metrics_service.compute_latency_percentiles(
            db=db,
            user_id=uid,
            pillar=pillar,
            window_days=window_days,
        )
        results.append({
            "pillar": pillar,
            "p50":    lp.p50,
            "p95":    lp.p95,
            "p99":    lp.p99,
            "p999":   lp.p999,
            "n":      lp.n,
        })

    return {"pillars": results, "window_days": window_days}


# ── Feedback endpoint ─────────────────────────────────────────────────────────

class FeedbackRequest(BaseModel):
    evaluation_id: str
    was_correct:   bool
    true_label:    Optional[bool] = None


@router.post("/feedback", status_code=201)
def submit_feedback(
    body: FeedbackRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    POST /api/metrics/feedback

    SDK feedback signal: marks an evaluation as correct/incorrect.
    Creates one audit_log_labels row per pillar in the evaluation,
    using the audit_trail's stored pillar scores as predicted values.

    Idempotent: if a label already exists for (request_id, pillar_name),
    the ground_truth_label and label_source are updated.

    Body:
      evaluation_id: str   — the request_id from the AnalysisResult
      was_correct:   bool  — true if the evaluation verdict was correct
      true_label:    bool  — the actual ground truth (was this truly a violation?)
                             defaults to: not was_correct when verdict was BLOCK
    """
    uid = current_user["id"]

    # Look up the audit_trail record for this evaluation
    from sqlalchemy import or_
    record = (
        db.query(AuditTrail)
        .filter(
            AuditTrail.request_id == body.evaluation_id,
            or_(AuditTrail.user_id == uid, AuditTrail.user_id.is_(None)),
        )
        .order_by(AuditTrail.created_at.desc())
        .first()
    )

    if not record:
        raise HTTPException(status_code=404, detail="Evaluation not found")

    meta: dict = record.action_metadata or {}
    pillars_data: dict = meta.get("pillars", {})
    verdict = meta.get("verdict", "")
    now = datetime.now(timezone.utc)

    # Derive true_label from was_correct + verdict if not explicitly provided
    ground_truth: Optional[bool] = body.true_label
    if ground_truth is None:
        if body.was_correct:
            # Evaluation was correct — true label matches what system did
            ground_truth = verdict in ("BLOCK", "REVIEW", "WARN")
        else:
            # Evaluation was wrong — invert: if system blocked, it was actually clean
            ground_truth = verdict not in ("BLOCK", "REVIEW", "WARN")

    inserted_pillars = []

    for pillar_name, pillar_data in pillars_data.items():
        if pillar_name not in PILLAR_NAMES:
            continue

        score = pillar_data.get("score")
        confidence = pillar_data.get("confidence")
        flags = pillar_data.get("flags", [])
        latency_ms = pillar_data.get("latency_ms")

        # predicted_label: pillar fired when score < 0.5 OR has flags
        if score is not None:
            predicted = bool(flags) or (float(score) < 0.5)
        else:
            predicted = bool(flags)

        # predicted_confidence: use stored confidence or derive from score distance to boundary
        if confidence is not None:
            pred_conf = float(confidence)
        elif score is not None:
            pred_conf = min(1.0, abs(float(score) - 0.5) * 2)
        else:
            pred_conf = 0.5

        row: Dict[str, Any] = {
            "request_id":           body.evaluation_id,
            "pillar_name":          pillar_name,
            "predicted_label":      predicted,
            "predicted_confidence": pred_conf,
            "ground_truth_label":   ground_truth,
            "label_source":         "sdk_feedback",
            "labeled_at":           now,
            "pillar_latency_ms":    int(latency_ms) if latency_ms else None,
            "user_id":              UUID(uid) if uid else None,
            "created_at":           now,
        }

        stmt = (
            pg_insert(AuditLogLabel)
            .values(**row)
            .on_conflict_do_update(
                constraint="uq_label_per_request_pillar",
                set_={
                    "ground_truth_label": ground_truth,
                    "label_source":       "sdk_feedback",
                    "labeled_at":         now,
                },
            )
        )
        db.execute(stmt)
        inserted_pillars.append(pillar_name)

    if not inserted_pillars:
        raise HTTPException(
            status_code=422,
            detail=(
                "No pillar data found in this evaluation's audit record. "
                "Ensure the evaluation was recorded after the telemetry update."
            ),
        )

    db.commit()

    logger.info(
        "feedback.recorded evaluation_id=%s pillars=%s was_correct=%s uid=%s",
        body.evaluation_id, inserted_pillars, body.was_correct, uid,
    )

    return {
        "ok":            True,
        "evaluation_id": body.evaluation_id,
        "pillars_labeled": inserted_pillars,
        "ground_truth":  ground_truth,
    }


# ── Helpers ───────────────────────────────────────────────────────────────────

def _parse_window(w: str) -> int:
    """Parse '1d', '7d', '30d' → int days. Default 7."""
    w = w.lower().strip()
    if w.endswith("d"):
        try:
            return max(1, min(90, int(w[:-1])))
        except ValueError:
            pass
    return 7
