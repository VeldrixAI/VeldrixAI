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
        "approval_rate": round(completed / (completed + failed) * 100, 1) if (completed + failed) > 0 else 0,
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
    try:
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
    except Exception as e:
        db.rollback()
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail=str(e))


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


@router.get("/sdk-stats")
async def get_sdk_stats(
    range: str = Query("30d", pattern="^(7d|14d|30d)$"),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Aggregated statistics derived from SDK trust_evaluation audit entries."""
    since = _since(range)
    uid_val = uuid.UUID(current_user["id"])

    rows = db.execute(text("""
        SELECT action_metadata FROM audit_trails
        WHERE action_type = 'trust_evaluation' AND created_at >= :since
          AND (user_id = :uid OR user_id IS NULL)
        ORDER BY created_at DESC
    """), {"uid": uid_val, "since": since}).fetchall()

    total = len(rows)
    verdict_counts = {"ALLOW": 0, "WARN": 0, "REVIEW": 0, "BLOCK": 0}
    pillar_totals: dict[str, list[float]] = {
        "safety": [], "hallucination": [], "bias": [], "prompt_security": [], "compliance": []
    }
    daily_counts: dict[str, int] = {}
    total_latency = 0
    score_sum = 0.0

    for row in rows:
        meta = row[0] or {}
        v = meta.get("verdict", "")
        if v in verdict_counts:
            verdict_counts[v] += 1
        for pillar, score in (meta.get("pillar_scores") or {}).items():
            if pillar in pillar_totals and score is not None:
                pillar_totals[pillar].append(score)
        ts = meta.get("timestamp")
        if ts:
            from datetime import datetime as dt
            day = dt.fromtimestamp(ts).strftime("%Y-%m-%d")
            daily_counts[day] = daily_counts.get(day, 0) + 1
        total_latency += meta.get("total_latency_ms", 0)
        score_sum += meta.get("overall_score", 0)

    return {
        "total_requests": total,
        "avg_trust_score": round(score_sum / total, 4) if total else 0,
        "avg_latency_ms": total_latency // total if total else 0,
        "verdict_breakdown": verdict_counts,
        "pillar_averages": {
            k: round(sum(v) / len(v), 4) if v else None
            for k, v in pillar_totals.items()
        },
        "daily_volume": [{"date": k, "count": v} for k, v in sorted(daily_counts.items())],
        "period_days": int(range[:-1]),
    }


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
