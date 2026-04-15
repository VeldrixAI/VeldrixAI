"""
WebSocket connection manager for real-time notification delivery.
Keyed by user_id. Multiple browser tabs per user are supported.
"""

import asyncio
import json
import logging
from typing import Dict, List

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class NotificationBroadcaster:
    def __init__(self):
        # user_id (str) → list of active WebSocket connections
        self._connections: Dict[str, List[WebSocket]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, user_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            if user_id not in self._connections:
                self._connections[user_id] = []
            self._connections[user_id].append(websocket)
        logger.info(
            "[Notifications] WS connected user=%s total_connections=%d",
            user_id,
            len(self._connections[user_id]),
        )

    async def disconnect(self, user_id: str, websocket: WebSocket) -> None:
        async with self._lock:
            conns = self._connections.get(user_id, [])
            try:
                conns.remove(websocket)
            except ValueError:
                pass
            if not conns:
                self._connections.pop(user_id, None)

    async def broadcast_to_user(self, user_id: str, payload: dict) -> None:
        """Fire-and-forget broadcast to all connections for a user."""
        connections = list(self._connections.get(user_id, []))
        if not connections:
            return

        message = json.dumps({"type": "TRUST_VIOLATION", "data": payload})
        dead: List[WebSocket] = []

        for ws in connections:
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)

        if dead:
            async with self._lock:
                for ws in dead:
                    try:
                        self._connections.get(user_id, []).remove(ws)
                    except ValueError:
                        pass
                if user_id in self._connections and not self._connections[user_id]:
                    del self._connections[user_id]


# Module-level singleton — import this instance everywhere
broadcaster = NotificationBroadcaster()
