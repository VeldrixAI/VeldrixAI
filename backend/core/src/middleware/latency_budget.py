"""LatencyBudgetMiddleware — attaches a LatencyBudget to every analyze request.

Responsibilities:
  1. Generate a stable request_id for the whole request lifecycle.
  2. Resolve the SLA tier from: explicit background flag > X-Veldrix-SLA-Tier
     header > org_plan on request.state > default (STANDARD).
  3. Attach a LatencyBudget to request.state.latency_budget.
  4. Measure wall-clock time and emit to LatencyCollector on response.
  5. Add X-Veldrix-Request-Id / X-Veldrix-Budget-Tier / X-Veldrix-Elapsed-Ms
     response headers for SDK clients to observe.

Mounted before auth middleware so the budget is available to all route handlers.
Only active on /api/v1/analyze — all other paths are passed through untouched.
"""
from __future__ import annotations

import time
import uuid
from typing import Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

from src.config.latency_tiers import get_budget_for_request
from src.telemetry.latency_collector import LatencyCollector

_ANALYZE_PATH = "/api/v1/analyze"


class LatencyBudgetMiddleware(BaseHTTPMiddleware):
    """
    Attaches a LatencyBudget to each POST /api/v1/analyze request.

    Usage (registered in main.py):
        app.add_middleware(LatencyBudgetMiddleware, collector=latency_collector)
    """

    def __init__(self, app: ASGIApp, collector: LatencyCollector) -> None:
        super().__init__(app)
        self._collector = collector

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Only instrument the analyze endpoint
        if not request.url.path.startswith(_ANALYZE_PATH):
            return await call_next(request)

        request_id = str(uuid.uuid4())
        start_time = time.perf_counter()

        # Explicit background flag can come from query string (SDK compat)
        background = (
            request.query_params.get("background", "false").lower() == "true"
        )

        # org_plan may be set by auth middleware; fall back to "growth"
        org_plan = getattr(request.state, "org_plan", "growth")

        budget = get_budget_for_request(
            request_headers=dict(request.headers),
            org_plan=org_plan,
            explicit_background=background,
            request_id=request_id,
        )

        # Attach to request.state — available to route handlers and the SDK
        request.state.latency_budget = budget
        request.state.request_id = request_id
        request.state.request_start = start_time

        response = await call_next(request)

        elapsed_ms = int((time.perf_counter() - start_time) * 1000)

        self._collector.record_request(
            tier=budget.tier,
            total_ms=elapsed_ms,
            request_id=request_id,
        )

        response.headers["X-Veldrix-Request-Id"]  = request_id
        response.headers["X-Veldrix-Budget-Tier"] = budget.tier
        response.headers["X-Veldrix-Elapsed-Ms"]  = str(elapsed_ms)

        return response
