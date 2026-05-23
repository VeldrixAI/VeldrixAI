"""SLA tier definitions for the VeldrixAI Request Budget Governor.

ARCHITECTURE (v3.0 — Accuracy + Speed):
  Per-pillar slots are GENEROUS (up to 4s) to let NIM inference produce
  real scores.  The total budget is TIGHT (500ms STANDARD, 200ms REALTIME)
  to enforce the p95 SLA.  When NIM is healthy (~300ms per call), all 5
  pillars return real results within the total budget and the user sees
  accurate trust scores.

  ┌─────────────────────────────────────────┐
  │  total_budget=500ms ← HARD deadline    │  ← Always fires first
  │  ┌─────────────────────────────────┐    │
  │  │  safety slot = 4000ms (safety) │    │  ← Generous, never fires
  │  │  hallu   slot = 4000ms         │    │     because total budget
  │  │  bias    slot = 4000ms         │    │     cancels all pillars
  │  │  prompt  slot = 4000ms         │    │     at 500ms
  │  │  compl   slot = 4000ms         │    │
  │  └─────────────────────────────────┘    │
  └─────────────────────────────────────────┘

Three tiers:
  REALTIME   — p95 ≤ 200 ms (enterprise)
  STANDARD   — p95 ≤ 500 ms (default)
  BACKGROUND — uncapped (fire-and-forget)
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


# Immutable tier blueprints
_TIER_BLUEPRINTS: dict[str, LatencyBudget] = {
    "REALTIME": LatencyBudget(
        tier="REALTIME",
        total_budget_ms=200,
        pillar_slots=PillarSlots(
            safety_ms=4000, hallucination_ms=4000,
            bias_ms=4000, prompt_security_ms=4000,
            compliance_ms=4000,
        ),
        background_mode=False,
    ),
    "STANDARD": LatencyBudget(
        tier="STANDARD",
        total_budget_ms=500,
        pillar_slots=PillarSlots(
            safety_ms=4000, hallucination_ms=4000,
            bias_ms=4000, prompt_security_ms=4000,
            compliance_ms=4000,
        ),
        background_mode=False,
    ),
    "BACKGROUND": LatencyBudget(
        tier="BACKGROUND",
        total_budget_ms=120000,
        pillar_slots=PillarSlots(
            safety_ms=30000, hallucination_ms=30000,
            bias_ms=30000, prompt_security_ms=30000,
            compliance_ms=30000,
        ),
        background_mode=True,
    ),
}

# Mutable copy — adaptive tuner mutates STANDARD slots at runtime
LATENCY_TIERS: dict[str, LatencyBudget] = copy.deepcopy(_TIER_BLUEPRINTS)


def resolve_tier(
    request_headers: dict,
    org_plan: str,
    explicit_background: bool,
) -> str:
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
    tier = resolve_tier(request_headers, org_plan, explicit_background)
    budget = copy.deepcopy(LATENCY_TIERS[tier])
    budget.request_id = request_id
    return budget
