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
"""

LATENCY_BUDGET_MS: dict[str, int] = {
    # Per-stage targets (ms) — Aggressive for sub-500ms SaaS SLA
    "auth_validation_ms":   10,   # Reduced from 15
    "rate_limit_check_ms":   2,   # Reduced from 3
    "payload_parsing_ms":    3,   # Reduced from 5
    "policy_lookup_ms":      5,   # Reduced from 10
    "pillar_dispatch_ms":  250,   # Target 250ms (was 350) - speculative execution helps
    "enforcement_ms":        5,   # Reduced from 10
    "response_assembly_ms":  3,   # Reduced from 5
    "audit_enqueue_ms":      1,   # fire-and-forget; must never block the response

    # End-to-end SLA targets (ms)
    "total_p50_target_ms":  200,   # Target sub-200ms p50 (was 300)
    "total_p95_target_ms":  400,   # Target sub-400ms p95 (was 500)
    "total_p99_target_ms":  500,   # Hard SLA: 500ms max (was 800)
}

# Per-stage warning thresholds — emit WARNING log when exceeded
LATENCY_WARN_THRESHOLDS_MS: dict[str, int] = {
    "auth_validation_ms":   30,   # Reduced from 50
    "pillar_dispatch_ms":  300,   # Reduced from 600
    "total_ms":            450,   # Reduced from 800
}
