"""Background evaluation worker for BACKGROUND-tier requests.

When a caller sets background=True (or X-Veldrix-SLA-Tier: BACKGROUND),
the analyze endpoint returns an immediate "accepted" response and delegates
the full five-pillar evaluation to this worker via asyncio.create_task().

The worker:
  1. Calls sdk.analyze() with the pre-generated request_id — this runs all
     pillars concurrently and writes the audit trail via SDKTelemetry.record().
  2. Optionally fires a webhook if a high-risk result is detected.
  3. On any failure, logs the error — the request_id is still recorded so
     the entry is never invisible to compliance teams.

Lifecycle: a single instance is created in main.py lifespan and stored on
app.state.background_worker.  All route handlers access it from there.
"""
from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from src.sdk.client import VeldrixSDK
    from src.sdk.models import AnalysisRequest

logger = logging.getLogger("veldrix.bg_worker")

_ALERT_SCORE_THRESHOLD = 0.7  # overall trust score below this triggers webhook


class BackgroundEvaluationWorker:
    """
    Fire-and-forget async evaluation task manager.

    Instantiated once per process; holds a reference to the SDK singleton.
    """

    def __init__(self, sdk: "VeldrixSDK") -> None:
        self._sdk = sdk
        self._active_tasks: set[asyncio.Task] = set()

    def submit(
        self,
        request: "AnalysisRequest",
        request_id: str,
        user_id: Optional[str] = None,
        actor_email: Optional[str] = None,
        webhook_url: Optional[str] = None,
    ) -> None:
        """
        Queue an evaluation task.  Non-blocking — returns in microseconds.

        The asyncio.create_task() schedules _run() on the running event loop.
        The task reference is tracked in _active_tasks so it isn't GC'd
        before completion.
        """
        task = asyncio.create_task(
            self._run(request, request_id, user_id, actor_email, webhook_url),
            name=f"bg-eval-{request_id[:8]}",
        )
        self._active_tasks.add(task)
        task.add_done_callback(self._active_tasks.discard)

    async def _run(
        self,
        request: "AnalysisRequest",
        request_id: str,
        user_id: Optional[str],
        actor_email: Optional[str],
        webhook_url: Optional[str],
    ) -> None:
        try:
            result = await self._sdk.analyze(
                request,
                user_id=user_id,
                actor_email=actor_email,
                request_id=request_id,
            )
            # Webhook: fire if overall trust score is below the alert threshold
            if webhook_url and result.trust_score.overall < _ALERT_SCORE_THRESHOLD:
                await _fire_webhook(webhook_url, request_id, result)

        except Exception as exc:
            # The audit trail entry was already attempted inside sdk.analyze();
            # log here so ops can correlate by request_id.
            logger.error(
                "Background evaluation failed request_id=%s error=%s",
                request_id,
                exc,
                exc_info=True,
            )

    @property
    def active_task_count(self) -> int:
        return len(self._active_tasks)


async def _fire_webhook(webhook_url: str, request_id: str, result) -> None:
    """POST a compact alert payload to the caller-supplied webhook URL."""
    import httpx  # local import — only used when webhook is configured

    payload = {
        "request_id":   request_id,
        "verdict":      result.trust_score.verdict,
        "overall":      result.trust_score.overall,
        "critical_flags": result.trust_score.critical_flags,
        "source":       "veldrix_background_evaluation",
    }
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(webhook_url, json=payload)
        logger.info("Webhook sent for request_id=%s url=%s", request_id, webhook_url)
    except Exception as exc:
        logger.warning(
            "Webhook delivery failed request_id=%s url=%s error=%s",
            request_id, webhook_url, exc,
        )
