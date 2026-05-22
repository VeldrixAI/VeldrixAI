"""Async telemetry sink — persists to audit trail and emits SSE events.

Latency recording is handled by the analyze.py route handler (with strong
task references and WARNING-level error logging) to ensure every SDK request
generates a latency record in the request_latency table.  This module is pure
audit-trail persistence and SSE broadcast.
"""
from __future__ import annotations

import logging
import os

from src.core.http_pool import get_internal_client
from src.sdk.models import AnalysisResult

logger = logging.getLogger("veldrix.telemetry")

CONNECTORS_URL = os.getenv("VELDRIX_CONNECTORS_URL", os.getenv("CONNECTORS_URL", "http://localhost:8002"))

logger.info("telemetry: CONNECTORS_URL=%s", CONNECTORS_URL)


class SDKTelemetry:
    async def record(
        self,
        result: AnalysisResult,
        prompt_preview: str | None = None,
        response_preview: str | None = None,
        user_id: str | None = None,
        actor_email: str | None = None,
    ) -> None:
        """Persist result to connectors audit trail and push SSE event."""
        target_url = f"{CONNECTORS_URL}/api/audit-trails/internal/audit-trail"
        logger.info("telemetry.persist: POST %s request_id=%s user_id=%s", target_url, result.request_id, user_id)

        # Build pillar_confidence map for frontend
        pillar_confidence = {k: v.confidence for k, v in result.pillars.items() if v.confidence is not None}

        try:
            client = get_internal_client()
            resp = await client.post(
                target_url,
                json={
                    "action_type": "trust_evaluation",
                    "entity_type": "sdk_analysis",
                    "user_id": user_id,
                    "actor_email": actor_email,
                    "metadata": {
                        "request_id": result.request_id,
                        "overall_score": result.trust_score.overall,
                        "verdict": result.trust_score.verdict,
                        "pillar_scores": result.trust_score.pillar_scores,
                        "pillar_confidence": pillar_confidence,
                        "critical_flags": result.trust_score.critical_flags,
                        "all_flags": result.trust_score.all_flags,
                        "total_latency_ms": result.total_latency_ms,
                        "sdk_version": result.sdk_version,
                        "timestamp": result.timestamp,
                        "prompt_preview": prompt_preview,
                        "response_preview": response_preview,
                        "pillars": {
                            k: {
                                "score":      v.score,
                                "status":     v.status.value,
                                "flags":      v.flags,
                                "confidence": v.confidence,
                                "latency_ms": v.latency_ms,
                            }
                            for k, v in result.pillars.items()
                        },
                        "per_pillar_ms": result.per_pillar_ms,
                        "timings_ms":    result.timings_ms,
                    },
                },
            )
            logger.info("telemetry.persisted request_id=%s status=%s", result.request_id, resp.status_code)
        except Exception as exc:
            logger.error("telemetry.persist_failed request_id=%s url=%s error=%s", result.request_id, target_url, exc)

        # ── SSE broadcast with all required fields ─────────────────────────────
        try:
            from src.core.sse import broadcast_event
            sse_payload = {
                "request_id": result.request_id,
                "trust_score": {
                    "overall": result.trust_score.overall,
                    "verdict": result.trust_score.verdict,
                    "pillar_scores": result.trust_score.pillar_scores,
                    "critical_flags": result.trust_score.critical_flags,
                    "all_flags": result.trust_score.all_flags,
                },
                "total_latency_ms": result.total_latency_ms,
                "sdk_version": result.sdk_version,
                "timestamp": result.timestamp,
                "per_pillar_ms": result.per_pillar_ms,
                "_user_id": user_id,
            }
            await broadcast_event("analysis_complete", sse_payload, user_id=user_id)
        except ImportError:
            pass
        except Exception as exc:
            logger.warning("telemetry.sse_broadcast failed: %s", exc)
