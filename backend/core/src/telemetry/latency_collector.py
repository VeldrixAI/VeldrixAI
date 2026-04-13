"""Per-pillar rolling latency statistics for the VeldrixAI trust pipeline.

Maintains a sliding window of 1000 samples per pillar.
Exposes p50 / p95 / p99 for the adaptive tuner and /internal/latency-stats.
Designed for single-threaded asyncio use — no locking needed.
"""
from __future__ import annotations

import time
import statistics
from collections import deque
from dataclasses import dataclass, field
from typing import Optional

# Canonical pillar names matching sdk/client.py
PILLAR_NAMES = ("safety", "hallucination", "bias", "prompt_security", "compliance")


@dataclass
class PillarStats:
    samples: deque = field(default_factory=lambda: deque(maxlen=1000))
    timeout_count: int = 0
    total_count: int = 0

    def add(self, elapsed_ms: int, timed_out: bool) -> None:
        self.samples.append(elapsed_ms)
        self.total_count += 1
        if timed_out:
            self.timeout_count += 1

    @property
    def p50(self) -> Optional[float]:
        if not self.samples:
            return None
        return statistics.median(self.samples)

    @property
    def p95(self) -> Optional[float]:
        if len(self.samples) < 20:
            return None
        s = sorted(self.samples)
        return s[int(len(s) * 0.95)]

    @property
    def p99(self) -> Optional[float]:
        if len(self.samples) < 100:
            return None
        s = sorted(self.samples)
        return s[int(len(s) * 0.99)]

    @property
    def timeout_rate(self) -> float:
        if self.total_count == 0:
            return 0.0
        return self.timeout_count / self.total_count

    def to_dict(self) -> dict:
        return {
            "p50_ms": round(self.p50, 1) if self.p50 is not None else None,
            "p95_ms": round(self.p95, 1) if self.p95 is not None else None,
            "p99_ms": round(self.p99, 1) if self.p99 is not None else None,
            "timeout_rate": round(self.timeout_rate, 4),
            "sample_count": self.total_count,
        }


class LatencyCollector:
    """
    In-memory rolling latency statistics.

    One PillarStats per pillar (1000-sample window).
    Also tracks total request latency by tier for dashboards.
    """

    def __init__(self) -> None:
        self.pillars: dict[str, PillarStats] = {
            name: PillarStats() for name in PILLAR_NAMES
        }
        self._request_samples: deque = deque(maxlen=1000)

    def record_pillar(
        self, pillar_name: str, elapsed_ms: int, timed_out: bool
    ) -> None:
        if pillar_name in self.pillars:
            self.pillars[pillar_name].add(elapsed_ms, timed_out)

    def record_request(self, tier: str, total_ms: int, request_id: str) -> None:
        self._request_samples.append(
            {"tier": tier, "total_ms": total_ms, "request_id": request_id, "ts": time.time()}
        )

    def get_stats(self) -> dict:
        return {
            "pillars": {
                name: stats.to_dict() for name, stats in self.pillars.items()
            },
            "requests": {
                "recent_count": len(self._request_samples),
            },
        }
