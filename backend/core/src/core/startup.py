"""
AegisAI Core — application startup and graceful shutdown.

On startup: validate NVIDIA_API_KEY and ping all five pillar model endpoints
via ``await warmup()``.  A missing key raises ``RuntimeError`` immediately so
the misconfiguration surfaces at boot rather than at first request.

On shutdown: call ``await shutdown()`` to close the shared httpx client and
release underlying TCP connections cleanly.

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
from typing import Dict

logger = logging.getLogger(__name__)


async def warmup() -> Dict[str, str]:
    """
    Validate NVIDIA NIM configuration and probe all pillar model endpoints.

    Triggers lazy ``httpx.AsyncClient`` creation, which validates
    ``NVIDIA_API_KEY`` and raises ``RuntimeError`` if it is absent.

    Returns:
        Dict mapping pillar name to ``"ok"``, ``"degraded"``, or
        ``"unreachable"``.

    Raises:
        RuntimeError: If ``NVIDIA_API_KEY`` is not set in the environment.
    """
    # Import here to avoid circular imports at module level.
    from src.pillars.implementations.ai_safety_pillars import _registry  # noqa: PLC0415

    logger.info("[Startup] Probing NVIDIA NIM endpoints for all pillars...")
    results = await _registry.health_check()

    for pillar, status in results.items():
        if status == "ok":
            logger.info("[Startup] %-20s → %s", pillar, status)
        elif status == "degraded":
            logger.warning("[Startup] %-20s → %s (slow or partial response)", pillar, status)
        else:
            logger.error("[Startup] %-20s → %s (check NVIDIA_API_KEY and model slug)", pillar, status)

    ok_count = sum(1 for s in results.values() if s == "ok")
    logger.info(
        "[Startup] Health check complete — %d/%d pillars reachable",
        ok_count,
        len(results),
    )
    return results


async def shutdown() -> None:
    """
    Close the shared NVIDIA NIM ``httpx.AsyncClient`` on application teardown.

    Safe to call even if the client was never initialised (no-op in that case).
    """
    from src.pillars.implementations.ai_safety_pillars import _registry  # noqa: PLC0415

    await _registry.close()
    logger.info("[Shutdown] NVIDIA NIM client closed cleanly")
