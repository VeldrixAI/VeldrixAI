"""Async telemetry sink — persists to audit trail and emits SSE events."""
from __future__ import annotations

import logging
import os

from src.core.http_pool import get_internal_client
from src.sdk.models import AnalysisResult

logger = logging.getLogger("veldrix.telemetry")

CONNECTORS_URL = os.getenv("VELDRIX_CONNECTORS_URL", os.getenv("CONNECTORS_URL", "http://localhost:8002"))

logger.info("telemetry: CONNECTORS_URL=%s", CONNECTORS_URL)


class SDKTelemetry:
    async def record(self, result: AnalysisResult, prompt_preview: str | None = None, response_preview: str | None = None, user_id: str | None = None, actor_email: str | None = None) -> None:
        """Persist result to connectors audit trail and push SSE event."""
        # ── Persist to connectors audit trail ─────────────────────────────────
        target_url = f"{CONNECTORS_URL}/api/audit-trails/internal/audit-trail"
        logger.info("telemetry.persist: POST %s request_id=%s user_id=%s", target_url, result.request_id, user_id)
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
            logger.info("telemetry.persisted request_id=%s status=%s", result.request_id, resp.status_code)
        except Exception as exc:
            # Persistence failure must NEVER crash the analyze() response
            logger.error("telemetry.persist_failed request_id=%s url=%s error=%s", result.request_id, target_url, exc)

        # ── SSE broadcast ─────────────────────────────────────────────────────
        try:
            from src.core.sse import broadcast_event
            await broadcast_event("analysis_complete", result.model_dump())
        except ImportError:
            pass
        except Exception as exc:
            logger.warning("telemetry.sse_broadcast failed: %s", exc)
