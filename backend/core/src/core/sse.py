"""
Server-Sent Events broadcast channel.

Dashboard subscribes to GET /api/v1/stream and receives AnalysisResult
events in real time whenever a trust evaluation completes.
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import AsyncGenerator

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

logger = logging.getLogger("veldrix.sse")
router = APIRouter(prefix="/api/v1", tags=["Stream"])

# In-process queue — non-blocking put; drops events when no consumer
_queue: asyncio.Queue = asyncio.Queue(maxsize=200)


async def broadcast_event(event_type: str, data: dict) -> None:
    """Push an event to all active SSE consumers (non-blocking)."""
    try:
        _queue.put_nowait({"type": event_type, "data": data})
    except asyncio.QueueFull:
        logger.debug("sse.broadcast dropped (no consumer or queue full)")


async def _event_stream() -> AsyncGenerator[str, None]:
    while True:
        try:
            event = await asyncio.wait_for(_queue.get(), timeout=25.0)
            payload = json.dumps(event["data"])
            yield f"event: {event['type']}\ndata: {payload}\n\n"
        except asyncio.TimeoutError:
            yield ": keepalive\n\n"


@router.get("/stream", summary="SSE stream for real-time analysis events")
async def stream() -> StreamingResponse:
    return StreamingResponse(
        _event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control":               "no-cache",
            "X-Accel-Buffering":           "no",
            "Access-Control-Allow-Origin": "*",
        },
    )
