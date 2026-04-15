"""Main FastAPI application."""

import asyncio
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path
from dotenv import load_dotenv

# Load .env before any module reads os.getenv — must happen before all local imports
load_dotenv(Path(__file__).resolve().parents[2] / ".env")

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware

from src.api.trust_controller import router as trust_router
from src.api.v1.analyze import router as analyze_v1_router
from src.api.internal import router as internal_router
from src.core.sse import router as sse_router
from src.core.startup import warmup, shutdown
from src.middlewares.error_handler import (
    validation_exception_handler,
    generic_exception_handler,
)
from src.middleware.latency_budget import LatencyBudgetMiddleware
from src.telemetry.latency_collector import LatencyCollector
from src.telemetry.adaptive_tuner import run_adaptive_tuner
from src.evaluation.background_worker import BackgroundEvaluationWorker


logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Startup:
      1. Warm up inference router (pillar model connections).
      2. Initialise LatencyCollector singleton → app.state.latency_collector.
      3. Initialise BackgroundEvaluationWorker → app.state.background_worker.
      4. Start adaptive timeout tuner as a background asyncio task.

    Shutdown:
      Cancel the adaptive tuner; close provider clients.
    """
    logger.info("VeldrixAI Core starting — initialising inference router...")
    await warmup()

    # ── Latency governor singletons ───────────────────────────────────────────
    collector = LatencyCollector()
    app.state.latency_collector = collector

    # Import SDK singleton here to avoid circular imports at module level
    from src.api.v1.dependencies import get_sdk
    sdk = await get_sdk()
    app.state.background_worker = BackgroundEvaluationWorker(sdk=sdk)

    # ── Adaptive tuner background task ────────────────────────────────────────
    tuner_interval = int(os.getenv("LATENCY_TUNER_INTERVAL_S", "60"))
    tuner_task = asyncio.create_task(
        run_adaptive_tuner(collector, interval_seconds=tuner_interval),
        name="adaptive-timeout-tuner",
    )

    logger.info(
        "VeldrixAI Core ready. Latency governor active. "
        "Adaptive tuner interval=%ds", tuner_interval
    )
    yield

    # ── Shutdown ──────────────────────────────────────────────────────────────
    logger.info("VeldrixAI Core shutting down...")
    tuner_task.cancel()
    try:
        await tuner_task
    except asyncio.CancelledError:
        pass
    await shutdown()


app = FastAPI(
    title="VeldrixAI Trust API",
    description="Five-Pillar Trust Evaluation Engine",
    version="0.2.0",
    lifespan=lifespan,
)

_raw_origins = os.getenv("VELDRIX_CORS_ORIGINS", "http://localhost:3000,http://localhost:5000")
_cors_origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Latency Budget Middleware ─────────────────────────────────────────────────
# Starlette applies middleware in reverse registration order — last-added runs
# outermost (first to see the request).  We add LatencyBudgetMiddleware after
# CORSMiddleware so budget assignment happens before route handlers.
#
# The LatencyCollector singleton is created in lifespan() after module-level
# code runs, so we subclass to lazily resolve it from app.state at dispatch
# time rather than at middleware construction time.

class _AppStateLatencyBudgetMiddleware(LatencyBudgetMiddleware):
    """Resolves the LatencyCollector from app.state at request time."""

    def __init__(self, app_asgi, **kwargs):
        # Placeholder collector — replaced per-request from app.state
        super().__init__(app_asgi, collector=LatencyCollector())

    async def dispatch(self, request, call_next):
        # Pull the live collector from app.state (set in lifespan)
        collector = getattr(
            getattr(request.app, "state", None),
            "latency_collector",
            self._collector,  # fall back to placeholder in test / early startup
        )
        self._collector = collector
        return await super().dispatch(request, call_next)

app.add_middleware(_AppStateLatencyBudgetMiddleware)

# Register exception handlers
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(Exception, generic_exception_handler)

# Register routers
app.include_router(trust_router)
app.include_router(analyze_v1_router)  # POST /api/v1/analyze, GET /api/v1/pillars|health
app.include_router(sse_router)          # GET  /api/v1/stream
app.include_router(internal_router)     # GET  /internal/latency-stats, /internal/background-queue


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}


# ── WebSocket: real-time notification stream ──────────────────────────────────

from src.services.notification_broadcaster import broadcaster  # noqa: E402


@app.websocket("/ws/notifications/{user_id}")
async def notifications_ws(
    websocket: WebSocket,
    user_id: str,
    token: str = "",
):
    """
    Persistent WebSocket for trust-violation notifications.
    Auth: JWT passed as ?token=<jwt> query param (httpOnly cookie unavailable over WS).
    """
    from src.middlewares.auth import verify_jwt_token  # local import avoids circular
    from fastapi import HTTPException

    # Validate the token before accepting the connection
    try:
        verified_user_id = await verify_jwt_token(authorization=f"Bearer {token}")
        if verified_user_id != user_id:
            await websocket.close(code=4003)
            return
    except HTTPException:
        await websocket.close(code=4001)
        return

    await broadcaster.connect(user_id, websocket)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        await broadcaster.disconnect(user_id, websocket)
