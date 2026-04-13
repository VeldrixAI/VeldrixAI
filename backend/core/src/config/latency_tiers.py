"""SLA tier definitions for the VeldrixAI Request Budget Governor.

Three tiers:
  REALTIME   — p95 ≤ 200 ms  (enterprise, hard real-time SDK calls)
  STANDARD   — p95 ≤ 600 ms  (default; starter and growth plans)
  BACKGROUND — uncapped       (fire-and-forget; returns immediately)

Pillar slot names match the SDK pillar IDs used in sdk/client.py:
  safety, hallucination, bias, prompt_security, compliance
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
            safety_ms=80,
            hallucination_ms=60,
            bias_ms=40,
            prompt_security_ms=40,
            compliance_ms=40,
        ),
        background_mode=False,
    ),
    "STANDARD": LatencyBudget(
        tier="STANDARD",
        total_budget_ms=8000,
        pillar_slots=PillarSlots(
            # Default slots are calibrated for real-world NIM inference (~4-6s per call).
            # The adaptive tuner narrows these toward p95×1.3 as telemetry accumulates.
            safety_ms=6000,
            hallucination_ms=6000,
            bias_ms=6000,
            prompt_security_ms=6000,
            compliance_ms=6000,
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
