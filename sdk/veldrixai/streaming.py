"""
VeldrixAI GuardedStream — wraps streaming LLM responses.
Accumulates chunks transparently, then fires trust evaluation when the stream ends.
"""

from __future__ import annotations
import asyncio
import logging
from typing import Any, AsyncIterator, Iterator, Optional

from veldrixai.models import TrustResult, GuardConfig

logger = logging.getLogger("veldrix.streaming")


class GuardedStream:
    """
    Transparent wrapper for streaming LLM responses.

    Passes each chunk through to the caller unchanged, accumulates the full
    text, then fires trust evaluation in the background when iteration ends.

    Usage (sync streaming):
        stream = GuardedStream(openai_stream, transport, config)
        for chunk in stream:
            print(chunk, end="", flush=True)
        print(stream.trust.verdict)  # available after iteration

    Usage (async streaming):
        async for chunk in GuardedStream(openai_stream, transport, config):
            print(chunk, end="", flush=True)
    """

    def __init__(
        self,
        stream:    Any,
        transport: Any,
        config:    GuardConfig,
        prompt:    str = "",
    ):
        self._stream    = stream
        self._transport = transport
        self._config    = config
        self._prompt    = prompt
        self._chunks:   list[str] = []
        self._trust:    Optional[TrustResult] = None

    # ── Sync iteration ─────────────────────────────────────────────────────────

    def __iter__(self) -> Iterator:
        for chunk in self._stream:
            text = self._extract_chunk_text(chunk)
            if text:
                self._chunks.append(text)
            yield chunk
        # Stream complete — fire evaluation
        self._fire_sync()

    # ── Async iteration ────────────────────────────────────────────────────────

    async def __aiter__(self) -> AsyncIterator:
        async for chunk in self._stream:
            text = self._extract_chunk_text(chunk)
            if text:
                self._chunks.append(text)
            yield chunk
        # Stream complete — fire evaluation
        await self._fire_async()

    # ── Trust result access ───────────────────────────────────────────────────

    @property
    def trust(self) -> TrustResult:
        if self._trust is None:
            from veldrixai.interceptor import _pending_trust
            return _pending_trust()
        return self._trust

    @property
    def full_text(self) -> str:
        return "".join(self._chunks)

    # ── Internal helpers ──────────────────────────────────────────────────────

    def _extract_chunk_text(self, chunk: Any) -> str:
        """Extract delta text from a streaming chunk."""
        # OpenAI / LiteLLM streaming delta
        try:
            delta = chunk.choices[0].delta
            return delta.content or ""
        except (AttributeError, IndexError):
            pass
        # String chunk
        if isinstance(chunk, str):
            return chunk
        return ""

    def _fire_sync(self):
        if not self._chunks:
            return
        response_text = self.full_text
        try:
            import threading
            def _run():
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                try:
                    client = self._transport._make_fresh_client()
                    self._trust = loop.run_until_complete(
                        self._transport.evaluate_with_client(
                            client, self._prompt, response_text, self._config
                        )
                    )
                except Exception as e:
                    logger.warning("VeldrixAI stream evaluation failed: %s", e)
                finally:
                    loop.run_until_complete(loop.shutdown_asyncgens())
                    loop.close()
            t = threading.Thread(target=_run, daemon=True)
            t.start()
            if not self._config.background:
                t.join(timeout=15)
        except Exception as e:
            logger.warning("VeldrixAI stream evaluation failed: %s", e)

    async def _fire_async(self):
        if not self._chunks:
            return
        response_text = self.full_text
        try:
            if self._config.background:
                asyncio.create_task(
                    self._transport.evaluate(self._prompt, response_text, self._config)
                )
            else:
                self._trust = await self._transport.evaluate(
                    self._prompt, response_text, self._config
                )
        except Exception as e:
            logger.warning("VeldrixAI stream evaluation failed: %s", e)

    def __repr__(self):
        return f"GuardedStream(chunks={len(self._chunks)}, trust={self._trust!r})"
