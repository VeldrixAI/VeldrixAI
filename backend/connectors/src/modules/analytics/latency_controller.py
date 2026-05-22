"""Latency recording (internal) and analytics (dashboard).

Provides:
  POST /internal/latency   — Internal endpoint for recording request latency
  GET  /api/analytics/latency — Dashboard analytics with p50/p95/p99/SLA

Both SDK evaluations and manual trust evaluations write to the request_latency
table, so the analytics endpoint reflects the true system latency.
"""

import logging
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel
from typing import Optional
from src.db.base import get_db
from src.core.middleware.auth import get_current_user
from src.modules.analytics.models import RequestLatency
from datetime import datetime, timedelta
import uuid

router = APIRouter(tags=["latency"])
logger = logging.getLogger(__name__)

SLA_MS = 500.0  # p95 SLA target


class LatencyRecord(BaseModel):
    user_id: Optional[str] = None
    endpoint: str
    latency_ms: float
    status_code: int = 200


@router.post("/internal/latency", status_code=201)
def record_latency(body: LatencyRecord, db: Session = Depends(get_db)):
    """Internal endpoint to record latency from core service or SDK telemetry."""
    try:
        user_uuid = uuid.UUID(body.user_id) if body.user_id else None
    except (ValueError, TypeError):
        user_uuid = None

    # Clamp absurd values — anything over 60s is likely a clock glitch or
    # a downstream timeout that shouldn't pollute the p50/p95 metrics
    clamped_ms = min(body.latency_ms, 60_000.0)

    try:
        row = RequestLatency(
            user_id=user_uuid,
            endpoint=body.endpoint,
            latency_ms=clamped_ms,
            status_code=body.status_code,
        )
        db.add(row)
        db.commit()
        logger.debug(
            "recorded latency: user=%s endpoint=%s latency_ms=%.1f clamped=%s",
            user_uuid, body.endpoint, body.latency_ms,
            "yes" if clamped_ms != body.latency_ms else "no",
        )
        return {"ok": True}
    except Exception as e:
        logger.error("failed to record latency: %s", e)
        db.rollback()
        return {"ok": False, "error": str(e)}


def _since(range: str) -> datetime:
    return datetime.utcnow() - timedelta(days=int(range[:-1]))


@router.get("/api/analytics/latency")
async def get_latency(
    range: str = Query("7d", pattern="^(7d|14d|30d)$"),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    since = _since(range)
    uid_val = uuid.UUID(current_user["id"])

    try:
        stats = db.execute(text("""
            SELECT
                COUNT(*)            AS total,
                AVG(latency_ms)     AS avg_ms,
                PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY latency_ms) AS p50_ms,
                PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95_ms,
                PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY latency_ms) AS p99_ms,
                MAX(latency_ms)     AS max_ms,
                COUNT(*) FILTER (WHERE latency_ms > :sla) AS sla_breaches
            FROM request_latency
            WHERE user_id = :uid AND created_at >= :since
              AND latency_ms > 0
        """), {"uid": uid_val, "since": since, "sla": SLA_MS}).fetchone()
    except Exception as exc:
        logger.warning("latency query failed: %s", exc)
        db.rollback()
        return {
            "range": range,
            "avg_ms": None,
            "p50_ms": None,
            "p95_ms": None,
            "p99_ms": None,
            "max_ms": None,
            "total_requests": 0,
            "sla_breaches": 0,
            "sla_compliance_pct": 100.0,
            "sla_target_ms": SLA_MS,
            "daily": [],
        }

    try:
        daily = db.execute(text("""
            SELECT
                DATE(created_at) AS date,
                ROUND(AVG(latency_ms)::numeric, 1) AS avg_ms,
                ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms)::numeric, 1) AS p95_ms,
                ROUND(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY latency_ms)::numeric, 1) AS p50_ms,
                COUNT(*) AS requests
            FROM request_latency
            WHERE user_id = :uid AND created_at >= :since
              AND latency_ms > 0
            GROUP BY DATE(created_at)
            ORDER BY date ASC
        """), {"uid": uid_val, "since": since}).fetchall()
    except Exception as exc:
        logger.warning("daily latency query failed: %s", exc)
        db.rollback()
        daily = []

    avg = round(stats.avg_ms, 1) if stats and stats.avg_ms else None
    p50 = round(stats.p50_ms, 1) if stats and stats.p50_ms else None
    p95 = round(stats.p95_ms, 1) if stats and stats.p95_ms else None
    p99 = round(stats.p99_ms, 1) if stats and stats.p99_ms else None
    total = stats.total or 0 if stats else 0
    breaches = stats.sla_breaches or 0 if stats else 0
    max_ms = round(stats.max_ms, 1) if stats and stats.max_ms else None
    sla_pct = round((1 - breaches / total) * 100, 1) if total > 0 else 100.0

    return {
        "range": range,
        "avg_ms": avg,
        "p50_ms": p50,
        "p95_ms": p95,
        "p99_ms": p99,
        "max_ms": max_ms,
        "total_requests": total,
        "sla_breaches": breaches,
        "sla_compliance_pct": sla_pct,
        "sla_target_ms": SLA_MS,
        "daily": [
            {
                "date": str(r.date),
                "avg_ms": float(r.avg_ms) if r.avg_ms else None,
                "p50_ms": float(r.p50_ms) if hasattr(r, 'p50_ms') and r.p50_ms else None,
                "p95_ms": float(r.p95_ms) if r.p95_ms else None,
                "requests": r.requests,
            }
            for r in daily
        ],
    }
