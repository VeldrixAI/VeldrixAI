"""Latency recording (internal) and analytics (dashboard)."""

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

SLA_MS = 200.0


class LatencyRecord(BaseModel):
    user_id: Optional[str] = None
    endpoint: str
    latency_ms: float
    status_code: int = 200


@router.post("/internal/latency", status_code=201)
def record_latency(body: LatencyRecord, db: Session = Depends(get_db)):
    row = RequestLatency(
        user_id=body.user_id,
        endpoint=body.endpoint,
        latency_ms=body.latency_ms,
        status_code=body.status_code,
    )
    db.add(row)
    db.commit()
    return {"ok": True}


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

    stats = db.execute(text("""
        SELECT
            COUNT(*)            AS total,
            AVG(latency_ms)     AS avg_ms,
            PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95_ms,
            MAX(latency_ms)     AS max_ms,
            COUNT(*) FILTER (WHERE latency_ms > :sla) AS sla_breaches
        FROM request_latency
        WHERE user_id = :uid AND created_at >= :since
    """), {"uid": uid_val, "since": since, "sla": SLA_MS}).fetchone()

    daily = db.execute(text("""
        SELECT
            DATE(created_at) AS date,
            ROUND(AVG(latency_ms)::numeric, 1) AS avg_ms,
            ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms)::numeric, 1) AS p95_ms,
            COUNT(*) AS requests
        FROM request_latency
        WHERE user_id = :uid AND created_at >= :since
        GROUP BY DATE(created_at)
        ORDER BY date ASC
    """), {"uid": uid_val, "since": since}).fetchall()

    avg = round(stats.avg_ms, 1) if stats.avg_ms else 0
    p95 = round(stats.p95_ms, 1) if stats.p95_ms else 0
    total = stats.total or 0
    breaches = stats.sla_breaches or 0
    sla_pct = round((1 - breaches / total) * 100, 1) if total > 0 else 100.0

    return {
        "range": range,
        "avg_ms": avg,
        "p95_ms": p95,
        "max_ms": round(stats.max_ms, 1) if stats.max_ms else 0,
        "total_requests": total,
        "sla_breaches": breaches,
        "sla_compliance_pct": sla_pct,
        "sla_target_ms": SLA_MS,
        "daily": [
            {"date": str(r.date), "avg_ms": float(r.avg_ms), "p95_ms": float(r.p95_ms), "requests": r.requests}
            for r in daily
        ],
    }
