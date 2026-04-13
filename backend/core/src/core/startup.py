"""
VeldrixAI Core — application startup and graceful shutdown.

On startup:
  - Initialise the inference router (creates pooled HTTP clients for all
    active providers).
  - Log the active provider list and their circuit-breaker states.
  - If NVIDIA NIM is active, a lightweight connectivity probe is logged
    (actual health is reported via GET /health/providers).

On shutdown:
  - Close all provider HTTP clients cleanly.

Usage in main.py::

    from contextlib import asynccontextmanager
    from src.core.startup import warmup, shutdown

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        await warmup()
        yield
        await shutdown()

    app = FastAPI(lifespan=lifespan)
"""

import logging

logger = logging.getLogger(__name__)


async def warmup() -> None:
    """
    Initialise the multi-provider inference router and log provider status.

    No longer raises RuntimeError if NVIDIA_API_KEY is absent — the router
    will route to the next available provider (Groq, Bedrock, OSS).
    """
    # Import here to avoid circular imports at module level.
    from src.inference.router import initialize_router          # noqa: PLC0415
    from src.inference.providers import get_active_providers    # noqa: PLC0415

    providers = get_active_providers()

    if not providers:
        logger.error(
            "[Startup] No inference providers configured. "
            "Set at least one of: NVIDIA_API_KEY, GROQ_API_KEY, "
            "BEDROCK_PROXY_URL, OSS_INFERENCE_URL"
        )
    else:
        logger.info(
            "[Startup] Active inference providers (%d): %s",
            len(providers),
            [p.name for p in providers],
        )

    await initialize_router()
    logger.info("[Startup] VeldrixAI inference router ready.")


async def shutdown() -> None:
    """
    Close all provider HTTP clients on application teardown.

    Safe to call even if the router was never initialised (no-op).
    """
    from src.inference.router import close_router  # noqa: PLC0415

    await close_router()
    logger.info("[Shutdown] Inference router closed cleanly.")
