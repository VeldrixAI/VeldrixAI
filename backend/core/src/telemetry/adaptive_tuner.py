"""Adaptive timeout tuner — adjusts STANDARD tier pillar slots at runtime.

Runs as a background asyncio task every `interval_seconds` (default 60).
Reads observed p95 per pillar from LatencyCollector and sets:

    slot = clamp(p95 × SAFETY_MARGIN, MIN_SLOT_MS, MAX_SLOT_MS)

Rules:
  - REALTIME slots are NEVER touched (hard SLA guarantee)
  - BACKGROUND slots are NEVER touched (already uncapped)
  - Only STANDARD tier is tuned
  - Minimum data required: 20 samples per pillar before any adjustment
  - Only applies the update when the delta > 10 ms (avoids churn)
"""
from __future__ import annotations

import asyncio
import logging

from src.config.latency_tiers import LATENCY_TIERS
from src.telemetry.latency_collector import LatencyCollector

logger = logging.getLogger("veldrix.adaptive_tuner")

SAFETY_MARGIN = 1.3    # slot = p95 × 1.3
MIN_SLOT_MS   = 30     # never drop below 30 ms per pillar
MAX_SLOT_MS   = 30000  # never exceed 30 s per pillar in STANDARD tier
MIN_DELTA_MS  = 10     # skip update when recommended change < 10 ms

# Maps pillar name → PillarSlots attribute
_PILLAR_TO_ATTR = {
    "safety":          "safety_ms",
    "hallucination":   "hallucination_ms",
    "bias":            "bias_ms",
    "prompt_security": "prompt_security_ms",
    "compliance":      "compliance_ms",
}


async def run_adaptive_tuner(
    collector: LatencyCollector,
    interval_seconds: int = 60,
) -> None:
    """
    Background coroutine — runs forever, waking every `interval_seconds`.
    Cancel it via the task reference to stop gracefully.
    """
    logger.info("Adaptive timeout tuner started (interval=%ds)", interval_seconds)
    while True:
        await asyncio.sleep(interval_seconds)
        _tune_once(collector)


def _tune_once(collector: LatencyCollector) -> None:
    """Single tuning pass — called by the loop and unit-testable in isolation."""
    stats = collector.get_stats()
    standard_slots = LATENCY_TIERS["STANDARD"].pillar_slots
    adjustments: dict[str, dict] = {}

    for pillar_name, attr in _PILLAR_TO_ATTR.items():
        pillar_stats = stats["pillars"].get(pillar_name, {})
        p95 = pillar_stats.get("p95_ms")
        timeout_rate = pillar_stats.get("timeout_rate", 0.0)

        if p95 is None:
            continue  # not enough data yet (< 20 samples)

        recommended = int(p95 * SAFETY_MARGIN)
        recommended = max(MIN_SLOT_MS, min(MAX_SLOT_MS, recommended))
        current = getattr(standard_slots, attr)

        if abs(recommended - current) >= MIN_DELTA_MS:
            setattr(standard_slots, attr, recommended)
            adjustments[f"STANDARD.{pillar_name}"] = {
                "from_ms":      current,
                "to_ms":        recommended,
                "p95_ms":       round(p95, 1),
                "timeout_rate": round(timeout_rate, 4),
            }

    if adjustments:
        logger.info("Adaptive tuner updated slots: %s", adjustments)
    else:
        logger.debug("Adaptive tuner: no slot adjustments needed this cycle")
