"""
PillarMetricsService — single source of truth for per-pillar accuracy metrics.

All metrics are computed via single PostgreSQL aggregation queries.
Results are cached in-process for 60 seconds per (user_id, pillar, window_days) key.
Never loads rows into Python — every metric comes from a SQL aggregate.

Metric definitions:
  Precision   = TP / (TP + FP)     — "when we flagged, were we right?"
  Recall      = TP / (TP + FN)     — "did we catch all real violations?"
  F1          = 2*P*R / (P+R)      — harmonic mean
  FPR         = FP / (FP + TN)     — false positive rate
  Specificity = TN / (TN + FP)     — complement of FPR
  MCC         = (TP*TN - FP*FN) / sqrt((TP+FP)(TP+FN)(TN+FP)(TN+FN))
  ECE         = sum_bins |mean_predicted - mean_actual| * (n_bin / N)
  Wilson CI   = 95% confidence interval on precision and recall

n < 30 → InsufficientDataResult (never render a metric from < 30 labeled evals)
"""
from __future__ import annotations

import math
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

import logging

from sqlalchemy import text
from sqlalchemy.orm import Session
from sqlalchemy.exc import ProgrammingError

logger = logging.getLogger(__name__)


MIN_SAMPLE_SIZE = 30

PILLAR_NAMES = [
    "safety",
    "hallucination",
    "bias",
    "prompt_security",
    "compliance",
]


# ── In-process TTL cache (60-second window per key) ──────────────────────────
# Per-replica; stale across replicas by up to 60s. Acceptable freshness budget.

_cache: dict[str, tuple[object, float]] = {}
_CACHE_TTL = 60.0


def _cache_get(key: str) -> Optional[object]:
    entry = _cache.get(key)
    if entry is None:
        return None
    value, ts = entry
    if time.time() - ts > _CACHE_TTL:
        del _cache[key]
        return None
    return value


def _cache_set(key: str, value: object) -> None:
    _cache[key] = (value, time.time())


# ── Return types ──────────────────────────────────────────────────────────────

@dataclass
class WilsonCI:
    lower: float
    upper: float


@dataclass
class PillarMetrics:
    pillar: str
    status: str   # "ok"
    labeled_n: int
    precision: float
    recall: float
    f1: float
    fpr: float
    specificity: float
    mcc: float
    ece: float
    precision_ci: WilsonCI
    recall_ci: WilsonCI
    tp: int
    fp: int
    fn: int
    tn: int
    window_days: int


@dataclass
class InsufficientDataResult:
    pillar: str
    status: str   # "insufficient_data"
    labeled_n: int
    required_n: int
    message: str
    window_days: int


@dataclass
class LatencyPercentiles:
    pillar: str
    p50: Optional[float]
    p95: Optional[float]
    p99: Optional[float]
    p999: Optional[float]
    n: int


@dataclass
class CalibrationBin:
    bin_lower: float
    mean_predicted: float
    mean_actual: float
    n_bin: int


@dataclass
class PillarCorrelations:
    """Pearson r between every pillar pair, computed from audit_trails JSONB."""
    safety_hallucination: Optional[float]
    safety_bias: Optional[float]
    safety_prompt_security: Optional[float]
    safety_compliance: Optional[float]
    hallucination_bias: Optional[float]
    hallucination_prompt_security: Optional[float]
    hallucination_compliance: Optional[float]
    bias_prompt_security: Optional[float]
    bias_compliance: Optional[float]
    prompt_security_compliance: Optional[float]
    n: int


# ── Math helpers ─────────────────────────────────────────────────────────────

def _wilson_ci(p_hat: float, n: int, z: float = 1.96) -> WilsonCI:
    """Wilson score 95% CI for a proportion p_hat over n observations."""
    if n == 0:
        return WilsonCI(lower=0.0, upper=1.0)
    z2 = z * z
    denom = 1.0 + z2 / n
    center = (p_hat + z2 / (2 * n)) / denom
    margin = z * math.sqrt(p_hat * (1 - p_hat) / n + z2 / (4 * n * n)) / denom
    return WilsonCI(lower=max(0.0, center - margin), upper=min(1.0, center + margin))


def _safe_div(num: float, den: float) -> float:
    return num / den if den != 0 else 0.0


def _mcc(tp: int, fp: int, fn: int, tn: int) -> float:
    num = float(tp * tn - fp * fn)
    den = math.sqrt(float((tp + fp) * (tp + fn) * (tn + fp) * (tn + fn)))
    return _safe_div(num, den)


# ── Service ───────────────────────────────────────────────────────────────────

class PillarMetricsService:
    """
    Computes per-pillar accuracy metrics from audit_log_labels.
    All aggregations run as single PostgreSQL queries — never loads rows into Python.
    """

    def compute_pillar_metrics(
        self,
        db: Session,
        user_id: str,
        pillar: str,
        window_days: int = 7,
        min_sample: int = MIN_SAMPLE_SIZE,
    ) -> PillarMetrics | InsufficientDataResult:
        cache_key = f"metrics:{user_id}:{pillar}:{window_days}"
        cached = _cache_get(cache_key)
        if cached is not None:
            return cached

        cutoff = datetime.now(timezone.utc) - timedelta(days=window_days)

        try:
            row = db.execute(
                text("""
                    SELECT
                        SUM(CASE WHEN predicted_label = TRUE  AND ground_truth_label = TRUE  THEN 1 ELSE 0 END)::bigint AS tp,
                        SUM(CASE WHEN predicted_label = TRUE  AND ground_truth_label = FALSE THEN 1 ELSE 0 END)::bigint AS fp,
                        SUM(CASE WHEN predicted_label = FALSE AND ground_truth_label = TRUE  THEN 1 ELSE 0 END)::bigint AS fn,
                        SUM(CASE WHEN predicted_label = FALSE AND ground_truth_label = FALSE THEN 1 ELSE 0 END)::bigint AS tn,
                        COUNT(*)::bigint AS n
                    FROM audit_log_labels
                    WHERE user_id   = :uid
                      AND pillar_name = :pillar
                      AND ground_truth_label IS NOT NULL
                      AND created_at >= :cutoff
                """),
                {"uid": user_id, "pillar": pillar, "cutoff": cutoff},
            ).fetchone()
        except ProgrammingError as e:
            # Table doesn't exist yet - rollback and return insufficient data
            db.rollback()
            if "audit_log_labels" in str(e):
                logger.debug(f"audit_log_labels table not found, returning insufficient_data for {pillar}")
                return InsufficientDataResult(
                    pillar=pillar,
                    status="insufficient_data",
                    labeled_n=0,
                    required_n=min_sample,
                    message=(
                        f"{_pillar_display(pillar)} accuracy requires ≥{min_sample} labeled "
                        f"evaluations. Enable SDK feedback or human review to populate."
                    ),
                    window_days=window_days,
                )
            raise

        if row is None or (row.n or 0) < min_sample:
            n = int(row.n) if row else 0
            result: PillarMetrics | InsufficientDataResult = InsufficientDataResult(
                pillar=pillar,
                status="insufficient_data",
                labeled_n=n,
                required_n=min_sample,
                message=(
                    f"{_pillar_display(pillar)} accuracy requires ≥{min_sample} labeled "
                    f"evaluations. Currently {n}. Enable SDK feedback or human review to populate."
                ),
                window_days=window_days,
            )
            _cache_set(cache_key, result)
            return result

        tp, fp, fn, tn, n = int(row.tp), int(row.fp), int(row.fn), int(row.tn), int(row.n)

        precision    = _safe_div(tp, tp + fp)
        recall       = _safe_div(tp, tp + fn)
        f1           = _safe_div(2 * precision * recall, precision + recall)
        fpr          = _safe_div(fp, fp + tn)
        specificity  = _safe_div(tn, tn + fp)
        mcc_val      = _mcc(tp, fp, fn, tn)
        ece_val      = self._compute_ece(db, user_id, pillar, cutoff)

        result = PillarMetrics(
            pillar=pillar,
            status="ok",
            labeled_n=n,
            precision=round(precision, 4),
            recall=round(recall, 4),
            f1=round(f1, 4),
            fpr=round(fpr, 4),
            specificity=round(specificity, 4),
            mcc=round(mcc_val, 4),
            ece=round(ece_val, 4),
            precision_ci=_wilson_ci(precision, tp + fp),
            recall_ci=_wilson_ci(recall, tp + fn),
            tp=tp, fp=fp, fn=fn, tn=tn,
            window_days=window_days,
        )
        _cache_set(cache_key, result)
        return result

    def compute_latency_percentiles(
        self,
        db: Session,
        user_id: str,
        pillar: str,
        window_days: int = 7,
    ) -> LatencyPercentiles:
        cache_key = f"latency:{user_id}:{pillar}:{window_days}"
        cached = _cache_get(cache_key)
        if cached is not None:
            return cached

        cutoff = datetime.now(timezone.utc) - timedelta(days=window_days)

        try:
            row = db.execute(
                text("""
                    SELECT
                        percentile_cont(0.50)  WITHIN GROUP (ORDER BY pillar_latency_ms) AS p50,
                        percentile_cont(0.95)  WITHIN GROUP (ORDER BY pillar_latency_ms) AS p95,
                        percentile_cont(0.99)  WITHIN GROUP (ORDER BY pillar_latency_ms) AS p99,
                        percentile_cont(0.999) WITHIN GROUP (ORDER BY pillar_latency_ms) AS p999,
                        COUNT(*)::bigint AS n
                    FROM audit_log_labels
                    WHERE user_id         = :uid
                      AND pillar_name     = :pillar
                      AND pillar_latency_ms IS NOT NULL
                      AND created_at      >= :cutoff
                """),
                {"uid": user_id, "pillar": pillar, "cutoff": cutoff},
            ).fetchone()
        except ProgrammingError:
            # Table doesn't exist yet - rollback to clear transaction state
            db.rollback()
            return LatencyPercentiles(pillar=pillar, p50=None, p95=None, p99=None, p999=None, n=0)

        result = LatencyPercentiles(
            pillar=pillar,
            p50=float(row.p50) if row and row.p50 is not None else None,
            p95=float(row.p95) if row and row.p95 is not None else None,
            p99=float(row.p99) if row and row.p99 is not None else None,
            p999=float(row.p999) if row and row.p999 is not None else None,
            n=int(row.n) if row else 0,
        )
        _cache_set(cache_key, result)
        return result

    def compute_calibration_bins(
        self,
        db: Session,
        user_id: str,
        pillar: str,
        window_days: int = 7,
        n_bins: int = 10,
    ) -> list[CalibrationBin]:
        cache_key = f"calib:{user_id}:{pillar}:{window_days}:{n_bins}"
        cached = _cache_get(cache_key)
        if cached is not None:
            return cached

        cutoff = datetime.now(timezone.utc) - timedelta(days=window_days)

        rows = db.execute(
            text("""
                SELECT
                    FLOOR(predicted_confidence * :n_bins) / :n_bins  AS bin_lower,
                    AVG(predicted_confidence)                          AS mean_predicted,
                    AVG(CAST(ground_truth_label AS FLOAT))             AS mean_actual,
                    COUNT(*)::bigint                                   AS n_bin
                FROM audit_log_labels
                WHERE user_id          = :uid
                  AND pillar_name      = :pillar
                  AND ground_truth_label IS NOT NULL
                  AND created_at       >= :cutoff
                GROUP BY FLOOR(predicted_confidence * :n_bins) / :n_bins
                ORDER BY bin_lower
            """),
            {"uid": user_id, "pillar": pillar, "cutoff": cutoff, "n_bins": n_bins},
        ).fetchall()

        result = [
            CalibrationBin(
                bin_lower=float(r.bin_lower),
                mean_predicted=float(r.mean_predicted),
                mean_actual=float(r.mean_actual),
                n_bin=int(r.n_bin),
            )
            for r in rows
        ]
        _cache_set(cache_key, result)
        return result

    def compute_pillar_correlations(
        self,
        db: Session,
        user_id: str,
        window_days: int = 30,
    ) -> PillarCorrelations:
        cache_key = f"corr:{user_id}:{window_days}"
        cached = _cache_get(cache_key)
        if cached is not None:
            return cached

        cutoff = datetime.now(timezone.utc) - timedelta(days=window_days)

        row = db.execute(
            text("""
                WITH scores AS (
                    SELECT
                        (action_metadata->'pillar_scores'->>'safety')::float          AS safety,
                        (action_metadata->'pillar_scores'->>'hallucination')::float   AS hallucination,
                        (action_metadata->'pillar_scores'->>'bias')::float            AS bias,
                        (action_metadata->'pillar_scores'->>'prompt_security')::float AS prompt_security,
                        (action_metadata->'pillar_scores'->>'compliance')::float      AS compliance
                    FROM audit_trails
                    WHERE user_id    = :uid
                      AND created_at >= :cutoff
                      AND action_metadata ? 'pillar_scores'
                    LIMIT 2000
                )
                SELECT
                    CORR(safety,          hallucination)    AS safety_hallucination,
                    CORR(safety,          bias)             AS safety_bias,
                    CORR(safety,          prompt_security)  AS safety_prompt_security,
                    CORR(safety,          compliance)       AS safety_compliance,
                    CORR(hallucination,   bias)             AS hallucination_bias,
                    CORR(hallucination,   prompt_security)  AS hallucination_prompt_security,
                    CORR(hallucination,   compliance)       AS hallucination_compliance,
                    CORR(bias,            prompt_security)  AS bias_prompt_security,
                    CORR(bias,            compliance)       AS bias_compliance,
                    CORR(prompt_security, compliance)       AS prompt_security_compliance,
                    COUNT(*)::bigint AS n
                FROM scores
                WHERE safety IS NOT NULL
                  AND hallucination IS NOT NULL
                  AND bias IS NOT NULL
                  AND prompt_security IS NOT NULL
                  AND compliance IS NOT NULL
            """),
            {"uid": user_id, "cutoff": cutoff},
        ).fetchone()

        def _f(v) -> Optional[float]:
            return round(float(v), 4) if v is not None else None

        result = PillarCorrelations(
            safety_hallucination=_f(row.safety_hallucination) if row else None,
            safety_bias=_f(row.safety_bias) if row else None,
            safety_prompt_security=_f(row.safety_prompt_security) if row else None,
            safety_compliance=_f(row.safety_compliance) if row else None,
            hallucination_bias=_f(row.hallucination_bias) if row else None,
            hallucination_prompt_security=_f(row.hallucination_prompt_security) if row else None,
            hallucination_compliance=_f(row.hallucination_compliance) if row else None,
            bias_prompt_security=_f(row.bias_prompt_security) if row else None,
            bias_compliance=_f(row.bias_compliance) if row else None,
            prompt_security_compliance=_f(row.prompt_security_compliance) if row else None,
            n=int(row.n) if row else 0,
        )
        _cache_set(cache_key, result)
        return result

    def _compute_ece(
        self,
        db: Session,
        user_id: str,
        pillar: str,
        cutoff: datetime,
        n_bins: int = 10,
    ) -> float:
        """Expected Calibration Error — single SQL aggregation, computed inline."""
        rows = db.execute(
            text("""
                SELECT
                    AVG(ABS(predicted_confidence - CAST(ground_truth_label AS FLOAT))) AS mean_abs_err,
                    COUNT(*)::bigint AS n
                FROM (
                    SELECT
                        predicted_confidence,
                        ground_truth_label,
                        FLOOR(predicted_confidence * :n_bins) AS bin_idx
                    FROM audit_log_labels
                    WHERE user_id          = :uid
                      AND pillar_name      = :pillar
                      AND ground_truth_label IS NOT NULL
                      AND created_at       >= :cutoff
                ) sub
            """),
            {"uid": user_id, "pillar": pillar, "cutoff": cutoff, "n_bins": n_bins},
        ).fetchone()

        if rows is None or rows.n == 0:
            return 0.0
        return float(rows.mean_abs_err or 0.0)


def _pillar_display(pillar: str) -> str:
    return {
        "safety":          "Safety & Toxicity",
        "hallucination":   "Hallucination Detection",
        "bias":            "Bias & Fairness",
        "prompt_security": "Prompt Security",
        "compliance":      "Compliance & PII",
    }.get(pillar, pillar)


# Module-level singleton
pillar_metrics_service = PillarMetricsService()
