"""
VeldrixAI GuardedStream — wraps streaming LLM responses.
Accumulates chunks transparently, then fires trust evaluation when the stream ends.

Streaming tool-call support
───────────────────────────
OpenAI streaming agent responses emit tool call argument deltas in
choices[0].delta.tool_calls[].function.arguments — content is None.
Fixed: _extract_chunk_text() accumulates tool call argument fragments keyed
by index; full_text assembles them as [tool_call:name] <args> so the trust
engine evaluates what the agent is actually doing.

Anthropic tool_use streaming (input_json_delta + content_block_start) is
handled identically.

Timeout-aware trust property
─────────────────────────────
If the background worker timed out, the trust property returns a degraded
TrustResult instead of PENDING — _eval_timed_out flag.

Fix — GuardedStream._fire_sync raw thread spawning:
  Previously spawned a raw daemon threading.Thread per stream with no cap.
  Under high-throughput sync streaming (Django + streaming responses) this
  created one OS thread per active stream. Fixed: _fire_sync now submits to
  the shared _SYNC_BG_POOL (bounded ThreadPoolExecutor, max 32 workers)
  from interceptor.py. Foreground (background=False) path uses a
  threading.Event to wait for the pool worker to signal completion —
  no extra raw thread is ever spawned.

Payload cap alignment:
  _fire_sync and _fire_async cap accumulated text at _MAX_PAYLOAD_CHARS
  (8 000 chars) — matching transport.py's cap exactly. Previously the
  streaming path sent unbounded text, causing inconsistent trust scores
  vs the decorator path for long responses.
"""

from __future__ import annotations
import asyncio
import logging
import threading
from typing import Any, AsyncIterator, Iterator, Optional

from veldrixai.models import TrustResult, GuardConfig
from veldrixai.transport import _MAX_PAYLOAD_CHARS

logger = logging.getLogger("veldrix.streaming")

# Per-stream accumulator for tool call argument fragments.
# Key: tool call index (int), Value: [name, [arg_fragments]]
_ToolCallAcc = dict[int, list]


class GuardedStream:
    """
    Transparent wrapper for streaming LLM responses.

    Passes each chunk through to the caller unchanged, accumulates the full
    text (including tool call arguments for agent mode), then fires trust
    evaluation in the background when iteration ends.

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
        self._stream          = stream
        self._transport       = transport
        self._config          = config
        self._prompt          = prompt
        self._chunks:         list[str]    = []
        self._tool_calls:     _ToolCallAcc = {}   # index → [name, [arg_fragments]]
        self._trust:          Optional[TrustResult] = None
        self._eval_timed_out: bool = False

    # ── Sync iteration ─────────────────────────────────────────────────────────

    def __iter__(self) -> Iterator:
        for chunk in self._stream:
            self._extract_chunk_text(chunk)
            yield chunk
        self._fire_sync()

    # ── Async iteration ────────────────────────────────────────────────────────

    async def __aiter__(self) -> AsyncIterator:
        async for chunk in self._stream:
            self._extract_chunk_text(chunk)
            yield chunk
        await self._fire_async()

    # ── Trust result access ───────────────────────────────────────────────────

    @property
    def trust(self) -> TrustResult:
        if self._eval_timed_out:
            from veldrixai.transport import _degraded_trust_result
            return _degraded_trust_result("stream_eval_timeout")
        if self._trust is None:
            from veldrixai.interceptor import _pending_trust
            return _pending_trust()
        return self._trust

    @property
    def full_text(self) -> str:
        """Full accumulated text including assembled tool call representations."""
        parts = list(self._chunks)
        for idx in sorted(self._tool_calls):
            entry = self._tool_calls[idx]
            name  = entry[0] or "unknown"
            args  = "".join(entry[1])
            parts.append(f"[tool_call:{name}] {args[:500]}")
        return " ".join(parts) if parts else ""

    # ── Chunk extraction ──────────────────────────────────────────────────────

    def _extract_chunk_text(self, chunk: Any) -> None:
        """
        Extract and accumulate text/tool-call content from a streaming chunk.
        Mutates self._chunks and self._tool_calls in place.
        Returns nothing — callers yield the original chunk unchanged.
        """
        # ── OpenAI / LiteLLM streaming delta ──────────────────────────────────
        try:
            delta = chunk.choices[0].delta
            if delta.content:
                self._chunks.append(delta.content)
                return
            tool_calls = getattr(delta, "tool_calls", None)
            if tool_calls:
                for tc in tool_calls:
                    idx  = getattr(tc, "index", 0)
                    fn   = getattr(tc, "function", None)
                    name = getattr(fn, "name", None) or ""
                    args = getattr(fn, "arguments", None) or ""
                    if idx not in self._tool_calls:
                        self._tool_calls[idx] = [name, []]
                    else:
                        if name and not self._tool_calls[idx][0]:
                            self._tool_calls[idx][0] = name
                    if args:
                        self._tool_calls[idx][1].append(args)
                return
        except (AttributeError, IndexError):
            pass

        # ── Anthropic content_block_start — captures tool name ─────────────────
        try:
            if chunk.type == "content_block_start":
                block = chunk.content_block
                if getattr(block, "type", "") == "tool_use":
                    idx  = getattr(chunk, "index", 0)
                    name = getattr(block, "name", "") or ""
                    self._tool_calls[idx] = [name, []]
                return
        except AttributeError:
            pass

        # ── Anthropic content_block_delta ──────────────────────────────────────
        try:
            if chunk.type == "content_block_delta":
                delta_type = getattr(chunk.delta, "type", "")
                if delta_type == "text_delta":
                    text = chunk.delta.text or ""
                    if text:
                        self._chunks.append(text)
                    return
                if delta_type == "input_json_delta":
                    idx     = getattr(chunk, "index", 0)
                    partial = chunk.delta.partial_json or ""
                    if idx not in self._tool_calls:
                        self._tool_calls[idx] = ["", []]
                    if partial:
                        self._tool_calls[idx][1].append(partial)
                    return
        except AttributeError:
            pass

        # ── Anthropic text_delta (legacy) ──────────────────────────────────────
        try:
            if chunk.type == "text_delta":
                text = chunk.text or ""
                if text:
                    self._chunks.append(text)
                return
        except AttributeError:
            pass

        # ── String chunk (HuggingFace TGI, Ollama, etc.) ──────────────────────
        if isinstance(chunk, str):
            if chunk:
                self._chunks.append(chunk)
            return

        # ── Dict chunk ─────────────────────────────────────────────────────────
        if isinstance(chunk, dict):
            text = chunk.get("text") or chunk.get("content") or ""
            if text:
                self._chunks.append(text)

    # ── Sync fire ─────────────────────────────────────────────────────────────

    def _fire_sync(self) -> None:
        """
        Fire trust evaluation after sync iteration completes.

        Background path  — submits to the shared bounded _SYNC_BG_POOL from
                           interceptor.py. Never spawns a raw thread.
        Foreground path  — submits to the same pool but waits on a
                           threading.Event for the result. Enforces
                           block_on_verdict after the worker signals done.
                           Join timeout covers the full retry budget.
        """
        response_text = self.full_text[:_MAX_PAYLOAD_CHARS]
        if not response_text:
            return

        from veldrixai.interceptor import _submit_to_pool
        transport = self._transport
        config    = self._config
        prompt    = self._prompt

        try:
            if config.background:
                # Background: submit and return immediately — no wait.
                def _run_bg() -> None:
                    loop   = asyncio.new_event_loop()
                    client = None
                    try:
                        client = transport._make_fresh_client()
                        loop.run_until_complete(
                            transport.evaluate_with_client(
                                client, prompt, response_text, config
                            )
                        )
                    except Exception as exc:
                        logger.debug(
                            "Background stream evaluation failed (non-fatal): %s", exc
                        )
                    finally:
                        if client is not None:
                            try:
                                loop.run_until_complete(client.aclose())
                            except Exception:
                                pass
                        try:
                            loop.run_until_complete(loop.shutdown_asyncgens())
                        except Exception:
                            pass
                        loop.close()

                _submit_to_pool(_run_bg)
                return

            # Foreground: wait for the pool worker via threading.Event.
            result_holder: list[TrustResult] = []
            exc_holder:    list[Exception]   = []
            done_event = threading.Event()

            def _run_fg() -> None:
                loop   = asyncio.new_event_loop()
                client = None
                try:
                    client = transport._make_fresh_client()
                    result_holder.append(
                        loop.run_until_complete(
                            transport.evaluate_with_client(
                                client, prompt, response_text, config
                            )
                        )
                    )
                except Exception as exc:
                    exc_holder.append(exc)
                finally:
                    if client is not None:
                        try:
                            loop.run_until_complete(client.aclose())
                        except Exception:
                            pass
                    try:
                        loop.run_until_complete(loop.shutdown_asyncgens())
                    except Exception:
                        pass
                    loop.close()
                    done_event.set()

            submitted = _submit_to_pool(_run_fg)
            if not submitted:
                # Pool saturated — degrade gracefully, never block the caller.
                self._eval_timed_out = True
                return

            from veldrixai.transport import MAX_RETRIES, BASE_BACKOFF
            timeout_s    = config.timeout_ms / 1000
            join_timeout = MAX_RETRIES * (timeout_s + BASE_BACKOFF * 4) + 5.0
            done_event.wait(timeout=join_timeout)

            if not done_event.is_set():
                self._eval_timed_out = True
                logger.warning(
                    "VeldrixAI stream evaluation timed out after %.1fs", join_timeout
                )
                return

            if exc_holder:
                from veldrixai.exceptions import VeldrixBlockError
                if isinstance(exc_holder[0], VeldrixBlockError):
                    raise exc_holder[0]
                logger.warning(
                    "VeldrixAI stream evaluation failed: %s", exc_holder[0]
                )
                return

            if result_holder:
                self._trust = result_holder[0]
                self._check_block()

        except Exception as exc:
            from veldrixai.exceptions import VeldrixBlockError
            if isinstance(exc, VeldrixBlockError):
                raise
            logger.warning("VeldrixAI stream evaluation failed: %s", exc)

    # ── Async fire ────────────────────────────────────────────────────────────

    async def _fire_async(self) -> None:
        response_text = self.full_text[:_MAX_PAYLOAD_CHARS]
        if not response_text:
            return
        try:
            if self._config.background:
                # Hold strong Task reference so GC cannot drop the evaluation.
                from veldrixai.interceptor import _BACKGROUND_TASKS
                task = asyncio.create_task(
                    self._transport.evaluate(self._prompt, response_text, self._config)
                )
                _BACKGROUND_TASKS.add(task)
                task.add_done_callback(_BACKGROUND_TASKS.discard)
            else:
                self._trust = await self._transport.evaluate(
                    self._prompt, response_text, self._config
                )
                # Enforce block_on_verdict after foreground async stream eval.
                # _check_block raises VeldrixBlockError — must propagate, not be caught.
                self._check_block()
        except Exception as exc:
            from veldrixai.exceptions import VeldrixBlockError
            if isinstance(exc, VeldrixBlockError):
                raise
            logger.warning("VeldrixAI stream evaluation failed: %s", exc)

    # ── Block enforcement ─────────────────────────────────────────────────────

    def _check_block(self) -> None:
        """
        Raise VeldrixBlockError if the trust verdict matches block_on_verdict.
        Only called on the foreground (background=False) path after self._trust
        is set. Background path returns PENDING immediately — block enforcement
        is not applicable (same contract as the non-streaming decorator path).
        """
        if self._trust is None:
            return
        if self._trust.verdict not in self._config.block_on_verdict:
            return
        if callable(self._config.on_block):
            self._config.on_block(self)
        else:
            from veldrixai.exceptions import VeldrixBlockError
            raise VeldrixBlockError(
                f"Streaming response blocked: verdict={self._trust.verdict}, "
                f"flags={self._trust.critical_flags}"
            )

    def __repr__(self) -> str:
        return (
            f"GuardedStream(chunks={len(self._chunks)}, "
            f"tool_calls={len(self._tool_calls)}, trust={self._trust!r})"
        )
