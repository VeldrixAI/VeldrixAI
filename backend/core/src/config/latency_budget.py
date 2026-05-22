"""
VeldrixAI Latency Budget — canonical per-stage SLA targets.

These constants are the single source of truth for latency targets across the
codebase. CI synthetic benchmarks fail the build if p95 exceeds total_p95_target_ms.

Stage definitions match the structured timings_ms dict emitted by sdk/client.py:
  auth_validation_ms    — API key validation against auth service
  rate_limit_check_ms   — rate limit check (if any)
  payload_parsing_ms    — FastAPI request body parsing + validation
  policy_lookup_ms      — org policy / tier lookup from middleware
  pillar_dispatch_ms    — wall-clock for asyncio.gather() across all 5 pillars
  enforcement_ms        — _aggregate_trust_score() + verdict derivation
  response_assembly_ms  — AnalysisResult construction
  audit_enqueue_ms      — asyncio.create_task() scheduling (fire-and-forget)

The pillar_dispatch_ms budget is the critical path. All 5 pillars run in parallel,
so wall-clock ≈ max(pillar_latencies), not sum(pillar_latencies).

VERSION 2.0 — Tightened for p95 < 500ms SLA:
  - Each pillar slot set to 250ms (was 6000ms for STANDARD)
  - Total budget reduced from 8000ms to 450ms
  - Adaptive tuner starts from a reasonable baseline
"""

LATENCY_BUDGET_MS: dict[str, int] = {
    # Per-stage targets (ms) — Aggressive for sub-500ms SaaS SLA
    "auth_validation_ms":   10,
    "rate_limit_check_ms":   2,
    "payload_parsing_ms":    3,
    "policy_lookup_ms":      5,
    "pillar_dispatch_ms":  250,   # 5 pillars run in parallel → wall-clock ≈ max slot
    "enforcement_ms":        5,
    "response_assembly_ms":  3,
    "audit_enqueue_ms":      1,

    # End-to-end SLA targets (ms)
    "total_p50_target_ms":  200,
    "total_p95_target_ms":  400,   # CI benchmark failure threshold
    "total_p99_target_ms":  500,
}

# Per-stage warning thresholds — emit WARNING log when exceeded
LATENCY_WARN_THRESHOLDS_MS: dict[str, int] = {
    "auth_validation_ms":   30,
    "pillar_dispatch_ms":  300,
    "total_ms":            450,
}
