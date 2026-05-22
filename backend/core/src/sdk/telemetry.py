"""Async telemetry sink — persists to audit trail and emits SSE events.

Also records request latency to the connectors request_latency table so the
dashboard's average latency computation includes SDK evaluation times.
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
        """Persist result to connectors audit trail and push SSE event.

        Also fires a fire-and-forget latency record so the dashboard's
        avg_latency_ms and p95 reflect SDK evaluation times.
        """
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

        # ── Fire-and-forget latency recording for dashboard metrics ──────────
        # The dashboard's avg_latency_ms and p95_latency_ms need data from BOTH
        # the request_latency table (legacy manual evals) AND SDK evaluations.
        # This ensures SDK timing always appears in the analytics summary.
        if user_id and result.total_latency_ms and result.total_latency_ms > 0:
            try:
                latency_url = f"{CONNECTORS_URL}/internal/latency"
                client2 = get_internal_client()
                await client2.post(
                    latency_url,
                    json={
                        "user_id": user_id,
                        "endpoint": "/api/v1/analyze",
                        "latency_ms": float(result.total_latency_ms),
                        "status_code": 200,
                    },
                )
                logger.debug("telemetry.latency_recorded request_id=%s ms=%s", result.request_id, result.total_latency_ms)
            except Exception as exc:
                # Never block the response for a fire-and-forget latency write
                logger.debug("telemetry.latency_record_failed request_id=%s: %s", result.request_id, exc)

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
