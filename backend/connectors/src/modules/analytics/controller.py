"""Analytics controller — real PostgreSQL aggregations over trust_reports and audit_trails.

Provides a unified summary endpoint that combines:
- SDK trust evaluations (from audit_trails where entity_type='sdk_analysis')
- Manual trust evaluations (from trust_reports)

Latency is computed from ALL sources to give an accurate picture.
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from src.db.base import get_db
from src.core.middleware.auth import get_current_user
from datetime import datetime, timedelta
import uuid
import logging

logger = logging.getLogger(__name__)

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

    # ── 1. Manual trust evaluations from trust_reports ──────────────────────────
    try:
        row = db.execute(text("""
            SELECT
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE status = 'completed') AS completed,
                COUNT(*) FILTER (WHERE status = 'failed') AS failed,
                COUNT(*) FILTER (WHERE status = 'generating') AS generating
            FROM trust_reports
            WHERE user_id = :uid AND is_deleted = false AND created_at >= :since
        """), {"uid": uid_val, "since": since}).fetchone()
        manual_total = row.total or 0
        manual_completed = row.completed or 0
        manual_failed = row.failed or 0
        manual_generating = row.generating or 0
    except Exception as exc:
        logger.warning("trust_reports query failed: %s", exc)
        db.rollback()
        manual_total = manual_completed = manual_failed = manual_generating = 0

    # ── 2. SDK trust evaluations from audit_trails ───────────────────────────────
    try:
        sdk_total = db.execute(text("""
            SELECT COUNT(*) FROM audit_trails
            WHERE user_id = :uid
              AND action_type = 'trust_evaluation'
              AND entity_type = 'sdk_analysis'
              AND created_at >= :since
        """), {"uid": uid_val, "since": since}).scalar() or 0
    except Exception as exc:
        logger.warning("audit_trails SDK count query failed: %s", exc)
        db.rollback()
        sdk_total = 0

    # Total audit requests = SDK trust evaluations + manual trust evaluations
    total_audit_requests = sdk_total + manual_total

    # ── 3. All audit trail events (any action type) for other analytics ─────────
    try:
        audit_total = db.execute(text("""
            SELECT COUNT(*) FROM audit_trails
            WHERE user_id = :uid AND created_at >= :since
        """), {"uid": uid_val, "since": since}).scalar() or 0
    except Exception as exc:
        logger.warning("audit_trails total count query failed: %s", exc)
        db.rollback()
        audit_total = 0

    # ── 4. Average latency from ALL sources ──────────────────────────────────────
    #    We compute a weighted average across:
    #    a) request_latency table (manual trust evaluations + legacy recordings)
    #    b) audit_trails action_metadata->>'total_latency_ms' (SDK evaluations)
    #
    #    This ensures the avg latency always reflects the real system behaviour
    #    regardless of which path a request took.

    avg_latency_ms = None
    try:
        # Combined latency from both sources via a UNION aggregation
        combined = db.execute(text("""
            WITH latency_from_request_table AS (
                SELECT latency_ms AS ms FROM request_latency
                WHERE user_id = :uid AND created_at >= :since
                  AND latency_ms IS NOT NULL
                  AND latency_ms > 0
            ),
            latency_from_audit_metadata AS (
                SELECT
                    CAST(action_metadata->>'total_latency_ms' AS numeric) AS ms
                FROM audit_trails
                WHERE user_id = :uid
                  AND created_at >= :since
                  AND action_metadata ? 'total_latency_ms'
                  AND action_metadata->>'total_latency_ms' IS NOT NULL
                  AND action_metadata->>'total_latency_ms' ~ '^[0-9]+(\\.[0-9]+)?$'
            ),
            combined_latencies AS (
                SELECT ms FROM latency_from_request_table
                UNION ALL
                SELECT ms FROM latency_from_audit_metadata
            )
            SELECT
                ROUND(AVG(ms)::numeric, 1) AS avg_ms,
                COUNT(*) AS n,
                ROUND(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY ms)::numeric, 1) AS p50_ms,
                ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY ms)::numeric, 1) AS p95_ms,
                ROUND(PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY ms)::numeric, 1) AS p99_ms
            FROM combined_latencies
            WHERE ms IS NOT NULL AND ms > 0
        """), {"uid": uid_val, "since": since}).fetchone()

        if combined and combined.n and combined.n > 0:
            avg_latency_ms = float(combined.avg_ms) if combined.avg_ms else None
        else:
            avg_latency_ms = None
    except Exception as exc:
        logger.warning("combined latency query failed: %s", exc)
        db.rollback()
        # Fallback: try just the request_latency table alone
        try:
            avg = db.execute(text("""
                SELECT ROUND(AVG(latency_ms)::numeric, 1) FROM request_latency
                WHERE user_id = :uid AND created_at >= :since
                  AND latency_ms IS NOT NULL AND latency_ms > 0
            """), {"uid": uid_val, "since": since}).scalar()
            avg_latency_ms = float(avg) if avg else None
        except Exception:
            db.rollback()
            avg_latency_ms = None

    # ── 5. P95 latency for SLA dashboard context ───────────────────────────────
    p95_latency_ms = None
    try:
        p95_row = db.execute(text("""
            WITH combined AS (
                SELECT latency_ms AS ms FROM request_latency
                WHERE user_id = :uid AND created_at >= :since
                  AND latency_ms IS NOT NULL AND latency_ms > 0
                UNION ALL
                SELECT CAST(action_metadata->>'total_latency_ms' AS numeric)
                FROM audit_trails
                WHERE user_id = :uid
                  AND created_at >= :since
                  AND action_metadata ? 'total_latency_ms'
                  AND action_metadata->>'total_latency_ms' ~ '^[0-9]+(\\.[0-9]+)?$'
            )
            SELECT PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY ms)
            FROM combined
            WHERE ms IS NOT NULL AND ms > 0
        """), {"uid": uid_val, "since": since}).scalar()
        if p95_row:
            p95_latency_ms = round(float(p95_row), 1)
    except Exception:
        db.rollback()

    return {
        "range": range,
        # ── Manual trust evaluations (legacy workspace) ──
        "total_evaluations": manual_total,
        "completed": manual_completed,
        "failed": manual_failed,
        "in_progress": manual_generating,

        # ── SDK trust evaluations ──
        "sdk_evaluations": sdk_total,

        # ── Combined audit requests (the top-card value) ──
        "total_audit_requests": total_audit_requests,
        "total_audit_events": audit_total,

        # ── Latency (combined from ALL sources) ──
        "avg_latency_ms": avg_latency_ms,
        "p95_latency_ms": p95_latency_ms,

        # ── Derived approval rate (from manual evaluations) ──
        "approval_rate": round(
            manual_completed / (manual_completed + manual_failed) * 100, 1
        ) if (manual_completed + manual_failed) > 0 else 0,
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
        WHERE action_type = 'trust_evaluation'
          AND entity_type = 'sdk_analysis'
          AND created_at >= :since
          AND (user_id = :uid OR user_id IS NULL)
        ORDER BY created_at DESC
    """), {"uid": uid_val, "since": since}).fetchall()

    total = len(rows)
    verdict_counts = {"ALLOW": 0, "WARN": 0, "REVIEW": 0, "BLOCK": 0}
    pillar_totals: dict[str, list[float]] = {
        "safety": [], "hallucination": [], "bias": [], "prompt_security": [], "compliance": []
    }
    daily_counts: dict[str, int] = {}
    total_latency = 0.0
    score_sum = 0.0
    latency_count = 0

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
            try:
                if isinstance(ts, (int, float)):
                    day = datetime.utcfromtimestamp(ts).strftime("%Y-%m-%d")
                else:
                    day = datetime.fromisoformat(str(ts)).strftime("%Y-%m-%d")
                daily_counts[day] = daily_counts.get(day, 0) + 1
            except (TypeError, ValueError):
                pass
        latency_val = meta.get("total_latency_ms")
        if latency_val is not None:
            try:
                total_latency += float(latency_val)
                latency_count += 1
            except (TypeError, ValueError):
                pass
        score_sum += meta.get("overall_score") or 0

    return {
        "total_requests": total,
        "avg_trust_score": round(score_sum / total, 4) if total else None,
        "avg_latency_ms": round(total_latency / latency_count, 1) if latency_count else None,
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
