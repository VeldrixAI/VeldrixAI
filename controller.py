"""Analytics controller — real PostgreSQL aggregations over trust_reports and audit_trails."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from src.db.base import get_db
from src.core.middleware.auth import get_current_user
from datetime import datetime, timedelta
import uuid

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


def _since(range: str) -> datetime:
    return datetime.utcnow() - timedelta(days=int(range[:-1]))


@router.get("/summary")
async def get_summary(
    range: str = Query("7d", pattern="^(7d|14d|30d)$"),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    since = _since(range)
    uid_val = uuid.UUID(current_user["id"])

    row = db.execute(text("""
        SELECT
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE status = 'completed') AS completed,
            COUNT(*) FILTER (WHERE status = 'failed') AS failed,
            COUNT(*) FILTER (WHERE status = 'generating') AS generating
        FROM trust_reports
        WHERE user_id = :uid AND is_deleted = false AND created_at >= :since
    """), {"uid": uid_val, "since": since}).fetchone()
    total = row.total or 0
    completed = row.completed or 0
    failed = row.failed or 0
    generating = row.generating or 0

    audit_total = db.execute(text("""
        SELECT COUNT(*) FROM audit_trails
        WHERE user_id = :uid AND created_at >= :since
    """), {"uid": uid_val, "since": since}).scalar() or 0

    avg_latency = None
    try:
        avg_latency = db.execute(text("""
            SELECT ROUND(AVG(latency_ms)::numeric, 1) FROM request_latency
            WHERE user_id = :uid AND created_at >= :since
        """), {"uid": uid_val, "since": since}).scalar()
    except Exception:
        db.rollback()

    return {
        "range": range,
        "total_evaluations": total,
        "completed": completed,
        "failed": failed,
        "in_progress": generating,
        "total_audit_events": audit_total,
        "approval_rate": round(completed / total * 100, 1) if total > 0 else 0,
        "avg_latency_ms": float(avg_latency) if avg_latency else None,
    }


@router.get("/timeseries")
async def get_timeseries(
    range: str = Query("7d", pattern="^(7d|14d|30d)$"),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    since = _since(range)
    uid_val = uuid.UUID(current_user["id"])

    rows = db.execute(text("""
        SELECT DATE(created_at) AS date,
               COUNT(*) AS total,
               COUNT(*) FILTER (WHERE status = 'completed') AS completed,
               COUNT(*) FILTER (WHERE status = 'failed') AS failed
        FROM trust_reports
        WHERE user_id = :uid AND is_deleted = false AND created_at >= :since
        GROUP BY DATE(created_at)
        ORDER BY date ASC
    """), {"uid": uid_val, "since": since}).fetchall()

    return [{"date": str(r.date), "requests": r.total, "approved": r.completed, "blocked": r.failed} for r in rows]


@router.get("/outcomes")
async def get_outcomes(
    range: str = Query("7d", pattern="^(7d|14d|30d)$"),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    since = _since(range)
    uid_val = uuid.UUID(current_user["id"])

    rows = db.execute(text("""
        SELECT report_type,
               COUNT(*) FILTER (WHERE status = 'completed') AS completed,
               COUNT(*) FILTER (WHERE status = 'failed') AS failed,
               COUNT(*) FILTER (WHERE status = 'generating') AS generating
        FROM trust_reports
        WHERE user_id = :uid AND is_deleted = false AND created_at >= :since
        GROUP BY report_type
    """), {"uid": uid_val, "since": since}).fetchall()

    return [{"type": r.report_type, "completed": r.completed, "failed": r.failed, "generating": r.generating} for r in rows]


@router.get("/audit-actions")
async def get_audit_actions(
    range: str = Query("7d", pattern="^(7d|14d|30d)$"),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    since = _since(range)
    uid_val = uuid.UUID(current_user["id"])

    rows = db.execute(text("""
        SELECT action_type, COUNT(*) AS cnt
        FROM audit_trails
        WHERE user_id = :uid AND created_at >= :since
        GROUP BY action_type ORDER BY cnt DESC
    """), {"uid": uid_val, "since": since}).fetchall()

    return [{"action": r.action_type, "count": r.cnt} for r in rows]
