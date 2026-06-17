"""Prometheus metrics for the Policy Engine runtime (Part B / B.2 — Observability).

This module is the SINGLE place policy/runtime telemetry is defined. It wires into
the existing Prometheus/Grafana stack (``observability/prometheus.yml`` already
scrapes ``veldrix-core:8001/metrics``) — it does NOT introduce a new telemetry system.

Hard constraint (B.2): **no governed content / PII may ever enter a metric.** Every
metric here is a count, a latency, or a low-cardinality verb/mode/pillar/tier label.
Never pass request text, signal values, tenant identifiers, or any payload field as a
label. The label sets below are deliberately closed enumerations.

``prometheus_client`` is an optional dependency: when it is not installed the module
degrades to no-op shims so the runtime and unit tests import and run unchanged. In a
real deploy the dependency is present (see requirements.txt) and ``/metrics`` renders.
"""

from __future__ import annotations

import logging

logger = logging.getLogger("veldrix.policy.metrics")

PROMETHEUS_AVAILABLE = True
try:  # pragma: no cover - exercised by both branches across environments
    from prometheus_client import (
        CONTENT_TYPE_LATEST,
        Counter,
        Histogram,
        generate_latest,
    )
except Exception:  # ModuleNotFoundError in dev/test without the dep
    PROMETHEUS_AVAILABLE = False
    CONTENT_TYPE_LATEST = "text/plain; version=0.0.4; charset=utf-8"

    class _NoopMetric:
        """Stand-in with the prometheus_client surface the runtime calls."""

        def __init__(self, *_a, **_k) -> None:
            pass

        def labels(self, *_a, **_k) -> "_NoopMetric":
            return self

        def inc(self, *_a, **_k) -> None:
            pass

        def observe(self, *_a, **_k) -> None:
            pass

        def set(self, *_a, **_k) -> None:
            pass

    Counter = Histogram = _NoopMetric  # type: ignore[assignment]

    def generate_latest(*_a, **_k) -> bytes:  # type: ignore[misc]
        return b"# prometheus_client not installed; policy metrics are no-ops\n"

    logger.warning(
        "prometheus_client not installed — policy metrics are no-ops. "
        "Install it (see requirements.txt) to expose /metrics."
    )


# ── Metric definitions (closed label sets — no payload content) ──────────────────

# Latency of one full runtime evaluation (signal-collection → resolve → audit-write).
# Buckets chosen to make p50/p95/p99 meaningful for a sub-ms engine behind I/O-bound
# signal collection (a few ms to the per-eval timeout budget of ~hundreds of ms).
EVAL_LATENCY = Histogram(
    "veldrix_policy_eval_latency_seconds",
    "Wall-clock latency of one Policy Engine runtime evaluation.",
    buckets=(0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5),
)

# Per-phase timing, so a slow evaluation is diagnosable end-to-end (the "trace").
PHASE_LATENCY = Histogram(
    "veldrix_policy_phase_latency_seconds",
    "Latency of one phase within a Policy Engine evaluation.",
    ["phase"],  # collect | resolve | audit_write
    buckets=(0.0005, 0.001, 0.005, 0.01, 0.05, 0.1, 0.25, 0.5, 1.0),
)

# Decisions reached, by action verb and enforcement mode. The mode dimension is the
# shadow-vs-enforce "blast radius" view (B.2 decision-record dashboard).
DECISIONS = Counter(
    "veldrix_policy_decisions_total",
    "Policy decisions reached, by action verb and enforcement mode.",
    ["action", "mode"],
)

# Whether a reached decision actually GATED traffic (enforced=true) vs was recorded
# only (enforced=false) — the exact shadow-mode counterfactual.
ENFORCED = Counter(
    "veldrix_policy_enforced_total",
    "Decisions by whether they gated traffic (enforced true/false).",
    ["enforced"],
)

# Safe-fallback activations, by kind (B.1). Surfaces degradation rather than hiding it.
FAIL_MODE_ACTIVATIONS = Counter(
    "veldrix_policy_fail_mode_activations_total",
    "Safe-fallback / fail-mode activations, by kind.",
    ["type"],  # timeout_budget | fail_closed | fail_open | engine_error | provider_degraded
)

# Per-pillar 'evaluated:false' count — directly exposes the score=92 fast-path / skip
# frequency (B.2 mandates surfacing, not hiding, this).
PILLAR_UNEVALUATED = Counter(
    "veldrix_policy_pillar_unevaluated_total",
    "Times a pillar signal was unavailable/unevaluated (evaluated:false), by pillar.",
    ["pillar"],
)

ENGINE_ERRORS = Counter(
    "veldrix_policy_engine_errors_total",
    "Policy Engine internal errors (failed closed for critical/high).",
)

# Provider-tier fallback (NIM→Groq→Bedrock→OSS): a tier whose breaker is OPEN/HALF_OPEN
# at evaluation time. Read from the existing circuit breaker; never reimplemented.
PROVIDER_FALLBACK = Counter(
    "veldrix_policy_provider_fallback_total",
    "Evaluations observing a degraded provider tier (breaker not CLOSED), by tier.",
    ["tier"],
)

# Backpressure: evaluations shed under sustained overload (bounded, not queued).
SHED = Counter(
    "veldrix_policy_shed_total",
    "Evaluations shed due to backpressure (concurrency limit reached).",
)


# ── Thin helpers the runtime calls (keeps prometheus surface in one place) ───────

def observe_eval_latency(seconds: float) -> None:
    EVAL_LATENCY.observe(seconds)


def observe_phase(phase: str, seconds: float) -> None:
    PHASE_LATENCY.labels(phase=phase).observe(seconds)


def record_decision(action: str, mode: str, enforced: bool) -> None:
    DECISIONS.labels(action=action, mode=mode).inc()
    ENFORCED.labels(enforced=str(bool(enforced)).lower()).inc()


def record_fail_mode(kind: str) -> None:
    FAIL_MODE_ACTIVATIONS.labels(type=kind).inc()


def record_pillar_unevaluated(pillar: str) -> None:
    PILLAR_UNEVALUATED.labels(pillar=pillar).inc()


def record_engine_error() -> None:
    ENGINE_ERRORS.inc()


def record_provider_fallback(tier: str) -> None:
    PROVIDER_FALLBACK.labels(tier=tier).inc()


def record_shed() -> None:
    SHED.inc()


def render() -> tuple[bytes, str]:
    """Return ``(body, content_type)`` for a ``GET /metrics`` handler."""
    return generate_latest(), CONTENT_TYPE_LATEST
