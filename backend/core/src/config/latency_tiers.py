"""SLA tier definitions for the VeldrixAI Request Budget Governor.

Three tiers:
  REALTIME   — p95 ≤ 200 ms  (enterprise, hard real-time SDK calls)
  STANDARD   — p95 ≤ 500 ms  (default; starter and growth plans)
  BACKGROUND — uncapped       (fire-and-forget; returns immediately)

Pillar slot names match the SDK pillar IDs used in sdk/client.py:
  safety, hallucination, bias, prompt_security, compliance

All five pillars run in parallel via asyncio.gather(), so the wall-clock
total ≈ max(pillar_slot_values), not the sum.  Overhead from request
parsing, score aggregation, and response assembly adds ~15-30ms.

VERSION 2.0 — Aggressive slots for sub-500ms p95 SLA:
  REALTIME:   40ms × 5 pillars in parallel → max 40ms
  STANDARD:  250ms × 5 pillars in parallel → max 250ms + overhead ≈ 280ms p50, < 500ms p95
  BACKGROUND: still generous for async queue processing (30s per pillar)
"""
from __future__ import annotations

import copy
from dataclasses import dataclass, field


@dataclass
class PillarSlots:
    safety_ms: int
    hallucination_ms: int
    bias_ms: int
    prompt_security_ms: int
    compliance_ms: int


@dataclass
class LatencyBudget:
    tier: str
    total_budget_ms: int
    pillar_slots: PillarSlots
    background_mode: bool
    request_id: str = field(default="")


# Immutable tier blueprints — copied per-request so mutations stay isolated
_TIER_BLUEPRINTS: dict[str, LatencyBudget] = {
    "REALTIME": LatencyBudget(
        tier="REALTIME",
        total_budget_ms=200,
        pillar_slots=PillarSlots(
            safety_ms=40,
            hallucination_ms=40,
            bias_ms=40,
            prompt_security_ms=40,
            compliance_ms=40,
        ),
        background_mode=False,
    ),
    "STANDARD": LatencyBudget(
        tier="STANDARD",
        total_budget_ms=500,
        pillar_slots=PillarSlots(
            # Aggressive 250ms per pillar — 5 run in parallel, so wall-clock
            # ≈ 250ms (plus ~15-30ms overhead for parsing/aggregation).
            # The adaptive tuner narrows these toward p95×1.2 as telemetry
            # accumulates, starting from this reasonable baseline.
            safety_ms=250,
            hallucination_ms=250,
            bias_ms=250,
            prompt_security_ms=250,
            compliance_ms=250,
        ),
        background_mode=False,
    ),
    "BACKGROUND": LatencyBudget(
        tier="BACKGROUND",
        total_budget_ms=120000,
        pillar_slots=PillarSlots(
            safety_ms=30000,
            hallucination_ms=30000,
            bias_ms=30000,
            prompt_security_ms=30000,
            compliance_ms=30000,
        ),
        background_mode=True,
    ),
}

# Module-level dict — adaptive tuner mutates STANDARD slots at runtime
LATENCY_TIERS: dict[str, LatencyBudget] = copy.deepcopy(_TIER_BLUEPRINTS)


def resolve_tier(
    request_headers: dict,
    org_plan: str,
    explicit_background: bool,
) -> str:
    """
    Determine SLA tier for an incoming request.

    Priority:
      1. explicit background=True in request body → BACKGROUND
      2. X-Veldrix-SLA-Tier header (enterprise overrides)
      3. org plan: 'enterprise' → REALTIME, else → STANDARD
      4. default → STANDARD
    """
    if explicit_background:
        return "BACKGROUND"
    header_tier = request_headers.get("x-veldrix-sla-tier", "").upper()
    if header_tier in LATENCY_TIERS:
        return header_tier
    plan_map = {
        "starter": "STANDARD",
        "growth": "STANDARD",
        "enterprise": "REALTIME",
    }
    return plan_map.get(org_plan.lower(), "STANDARD")


def get_budget_for_request(
    request_headers: dict,
    org_plan: str,
    explicit_background: bool,
    request_id: str,
) -> LatencyBudget:
    """Return a fresh LatencyBudget copy with the request_id stamped in."""
    tier = resolve_tier(request_headers, org_plan, explicit_background)
    budget = copy.deepcopy(LATENCY_TIERS[tier])
    budget.request_id = request_id
    return budget
