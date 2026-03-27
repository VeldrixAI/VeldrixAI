"""Async telemetry sink — persists to audit trail and emits SSE events."""
from __future__ import annotations

import logging
import os

import httpx

from src.sdk.models import AnalysisResult

logger = logging.getLogger("veldrix.telemetry")

CONNECTORS_URL = os.getenv("VELDRIX_CONNECTORS_URL", os.getenv("CONNECTORS_URL", "http://localhost:8002"))


class SDKTelemetry:
    async def record(self, result: AnalysisResult, prompt_preview: str | None = None, response_preview: str | None = None, user_id: str | None = None, user_timezone: str = "UTC") -> None:
        """Persist result to connectors audit trail and push SSE event."""
        # ── Persist to connectors audit trail ─────────────────────────────────
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                await client.post(
                    f"{CONNECTORS_URL}/api/audit-trails/internal/audit-trail",
                    json={
                        "action_type": "trust_evaluation",
                        "entity_type": "sdk_analysis",
                        "user_id": user_id,
                        "user_timezone": user_timezone,
                        "metadata": {
                            "request_id": result.request_id,
                            "overall_score": result.trust_score.overall,
                            "verdict": result.trust_score.verdict,
                            "pillar_scores": result.trust_score.pillar_scores,
                            "critical_flags": result.trust_score.critical_flags,
                            "all_flags": result.trust_score.all_flags,
                            "total_latency_ms": result.total_latency_ms,
                            "sdk_version": result.sdk_version,
                            "timestamp": result.timestamp,
                            "prompt_preview": prompt_preview,
                            "response_preview": response_preview,
                            "pillars": {
                                k: {"score": v.score, "status": v.status.value, "flags": v.flags}
                                for k, v in result.pillars.items()
                            },
                        },
                    },
                )
            logger.debug("telemetry.persisted request_id=%s", result.request_id)
        except Exception as exc:
            # Persistence failure must NEVER crash the analyze() response
            logger.error("telemetry.persist_failed request_id=%s: %s", result.request_id, exc)

        # ── SSE broadcast ─────────────────────────────────────────────────────
        try:
            from src.core.sse import broadcast_event
            await broadcast_event("analysis_complete", result.model_dump())
        except ImportError:
            pass
        except Exception as exc:
            logger.warning("telemetry.sse_broadcast failed: %s", exc)
