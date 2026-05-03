"""
VeldrixAI Transport Layer
─────────────────────────
Sends prompt+response to the VeldrixAI trust API and returns a TrustResult.

Resilience stack (innermost → outermost):
  1. TokenBucket          — client-side rate limiter (100 RPS / 200 burst default)
  2. BoundedDispatchQueue — async FIFO for background evaluations (10k depth)
  3. ClientCircuitBreaker — trips after N consecutive 5xx/timeouts, auto-recovers
  4. Retry loop           — 3 attempts with exponential backoff + Retry-After respect
  5. Degraded fallback    — verdict=UNKNOWN, never raises in background mode

Event-loop contract:
  - evaluate()            → async, uses shared singleton AsyncClient (same loop)
  - evaluate_with_client()→ async, caller owns the client lifecycle
  - evaluate_sync()       → spawns a daemon thread with its own loop + fresh client
  - _make_fresh_client()  → creates an ephemeral client; call from the thread that owns it

Fix — Issue 2: _ensure_drain_worker race condition
  Previously two concurrent evaluate() calls could both see _drain_task is None
  and create two competing drain workers. Fixed with an asyncio.Lock guard so
  the task is created exactly once.

Fix — Issue 3: evaluate_sync join timeout
  Previously the join timeout was self._timeout + 5, which is shorter than the
  maximum retry duration (MAX_RETRIES * timeout + backoff). The thread could
  still be in-flight when join() returned, causing a false degraded result.
  Fixed: join timeout is now MAX_RETRIES * (self._timeout + BASE_BACKOFF * 4) + 5.
"""

from __future__ import annotations
import asyncio
import logging
import secrets
import threading
import time
from typing import Optional

import httpx

from veldrixai.models     import TrustResult, PillarScore, GuardConfig
from veldrixai.exceptions import (
    VeldrixAuthError, VeldrixAPIError, VeldrixTimeoutError, VeldrixServiceUnavailableError,
)
from veldrixai._transport.rate_limiter import TokenBucket, BoundedDispatchQueue, ClientCircuitBreaker

_UNSET = object()  # sentinel — async client not yet created

logger = logging.getLogger("veldrix.transport")

DEFAULT_BASE_URL = "https://api.veldrix.ai"
MAX_RETRIES      = 3
BASE_BACKOFF     = 0.4
_MAX_PAYLOAD_CHARS = 8_000   # chars sent per field to the API
_MAX_RETRY_AFTER   = 30.0    # cap Retry-After header to prevent runaway sleeps


def _sdk_version() -> str:
    try:
        from importlib.metadata import version
        return version("veldrixai")
    except Exception:
        return "1.0.0"


class Transport:
    def __init__(
        self,
        api_key: str,
        base_url: str,
        timeout_ms: int = 10_000,
        rate_limit_rps: float = 100.0,
        rate_limit_burst: float = 200.0,
        queue_max_size: int = 10_000,
        queue_overflow_policy: str = "drop_oldest",
        client_breaker_threshold: int = 10,
        client_breaker_recovery_seconds: float = 30.0,
    ):
        self._api_key  = api_key
        self._base_url = base_url.rstrip("/")
        self._timeout  = timeout_ms / 1000

        # Shared singleton AsyncClient — lazily created on first async call
        # inside the running event loop so it is always bound to the correct loop.
        # Background threads MUST use _make_fresh_client() instead.
        self._client: object = _UNSET
        # asyncio.Lock for singleton client init — created lazily inside the
        # running loop on first async call. Never created in __init__ or from
        # a threading.Lock context (that would bind it to the wrong loop).
        self._client_lock: Optional[asyncio.Lock] = None

        # Resilience primitives
        self._bucket  = TokenBucket(capacity=rate_limit_burst, refill_rate=rate_limit_rps)
        self._queue   = BoundedDispatchQueue(max_size=queue_max_size, on_overflow=queue_overflow_policy)
        self._breaker = ClientCircuitBreaker(
            threshold=client_breaker_threshold,
            recovery_seconds=client_breaker_recovery_seconds,
        )

        # drain_worker task handle — started lazily on first background dispatch
        self._drain_task: Optional[asyncio.Task] = None
        # asyncio.Lock that serialises drain_worker creation — prevents the
        # TOCTOU race where two concurrent evaluate() calls both see
        # _drain_task is None and create two competing workers.
        self._drain_lock: Optional[asyncio.Lock] = None

    def stats(self) -> dict:
        """
        Return live SDK counters for observability / dashboards.

            print(veldrix.stats())
            # {
            #   "queue_depth": 0,
            #   "queue_dropped_total": 0,
            #   "rate_limited_total": 0,
            #   "breaker_state": "CLOSED",
            #   "breaker_trips_total": 0,
            #   "breaker_dropped_total": 0,
            # }
        """
        q = self._queue.stats()
        b = self._breaker.stats()
        return {
            "queue_depth":           q["depth"],
            "queue_dropped_total":   q["dropped_total"],
            "rate_limited_total":    self._bucket.throttle_count,
            "breaker_state":         b["breaker_state"],
            "breaker_trips_total":   b["breaker_trips_total"],
            "breaker_dropped_total": b.get("breaker_dropped_total", 0),
        }

    @property
    def base_url(self) -> str:
        """Public read-only accessor for the configured API base URL."""
        return self._base_url

    async def _get_client(self) -> httpx.AsyncClient:
        """
        Returns the shared singleton AsyncClient.
        The asyncio.Lock is created lazily on the first call — always inside
        the running event loop, never in __init__ or from a threading context.
        Only call from async paths. Background threads MUST use _make_fresh_client().
        """
        # Lazy-create the asyncio.Lock on first async call.
        # This is safe because we are already inside a running event loop here.
        if self._client_lock is None:
            self._client_lock = asyncio.Lock()

        async with self._client_lock:
            if self._client is _UNSET or (
                isinstance(self._client, httpx.AsyncClient) and self._client.is_closed
            ):
                self._client = httpx.AsyncClient(
                    timeout=httpx.Timeout(connect=5.0, read=self._timeout, write=5.0, pool=2.0),
                    limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
                )
        return self._client  # type: ignore[return-value]

    def _make_fresh_client(self) -> httpx.AsyncClient:
        """
        Creates a brand-new httpx.AsyncClient with no event loop binding.
        Must be called from within the thread/loop that will use it.
        Always close after use — never share across threads or loops.
        """
        return httpx.AsyncClient(
            timeout=httpx.Timeout(
                connect=5.0,
                read=self._timeout,
                write=5.0,
                pool=2.0,
            ),
            limits=httpx.Limits(
                max_connections=10,
                max_keepalive_connections=0,   # no keepalive — client is ephemeral
            ),
        )

    async def _ensure_drain_worker(self) -> None:
        """
        Start the queue drain_worker task if it hasn't been started yet.
        Must be called from inside a running event loop.
        The task is a daemon — it runs for the lifetime of the transport.

        Fix — Issue 2: guarded by an asyncio.Lock (created lazily inside the
        running loop) so concurrent evaluate() calls cannot create two workers.
        """
        if self._drain_lock is None:
            self._drain_lock = asyncio.Lock()
        async with self._drain_lock:
            if self._drain_task is None or self._drain_task.done():
                self._drain_task = asyncio.create_task(
                    self._queue.drain_worker(),
                    name="veldrix-drain-worker",
                )
                logger.debug("veldrix drain_worker started")

    async def evaluate(
        self,
        prompt:   str,
        response: str,
        config:   GuardConfig,
    ) -> TrustResult:
        """
        Evaluate a prompt+response pair against the VeldrixAI trust API.

        Exception contract:
          - VeldrixAuthError:              ALWAYS raised (401). Invalid API key.
          - VeldrixTimeoutError:           Raised only when background=False.
          - VeldrixAPIError:               Raised only when background=False (5xx / retries exhausted).
          - VeldrixServiceUnavailableError:Raised only when background=False and breaker is OPEN.
          - VeldrixRateLimitError:         Raised only when background=False and bucket exhausted.
          - All other errors:              Always silent. Returns degraded TrustResult.

        Degraded TrustResult: verdict="UNKNOWN", overall=0.0, is_degraded=True.
        """
        # ── 1. Circuit breaker ────────────────────────────────────────────────
        if self._breaker.is_open():
            self._breaker.record_drop()
            if not config.background:
                raise VeldrixServiceUnavailableError(
                    "VeldrixAI client circuit breaker is OPEN — backend is degraded. "
                    f"Retry after {self._breaker._recovery}s or check veldrix.stats()."
                )
            logger.debug("veldrix breaker OPEN: dropping background evaluation")
            return _degraded_trust_result("client_breaker_open")

        # ── 2. Token bucket rate limiting ─────────────────────────────────────
        token_timeout = self._timeout if not config.background else 5.0
        acquired = await self._bucket.acquire(timeout=token_timeout)
        if not acquired:
            if not config.background:
                from veldrixai.exceptions import VeldrixRateLimitError
                raise VeldrixRateLimitError(
                    f"VeldrixAI rate limit exceeded ({self._bucket._refill_rate:.0f} RPS). "
                    "Reduce request rate or increase rate_limit_rps."
                )
            return _degraded_trust_result("rate_limited")

        # ── 3. Background path — submit to bounded queue ──────────────────────
        if config.background:
            await self._ensure_drain_worker()
            client = await self._get_client()

            async def _dispatch():
                await self.evaluate_with_client(client, prompt, response, config)

            enqueued = await self._queue.submit(_dispatch)
            if not enqueued:
                logger.debug("veldrix queue full: background evaluation dropped")
            return _pending_trust_result()

        # ── 4. Foreground path — evaluate inline ──────────────────────────────
        return await self.evaluate_with_client(await self._get_client(), prompt, response, config)

    async def evaluate_with_client(
        self,
        client:   httpx.AsyncClient,
        prompt:   str,
        response: str,
        config:   GuardConfig,
    ) -> TrustResult:
        """
        Variant of evaluate() that accepts an externally-provided client.
        Used by background threads that own their own client lifecycle.

        Exception contract is identical to evaluate():
          - VeldrixAuthError:    ALWAYS raised.
          - VeldrixTimeoutError: Raised only when config.background=False.
          - VeldrixAPIError:     Raised only when config.background=False.
          - All other errors:    Always silent degradation.
        """
        request_id = secrets.token_hex(12)   # client-generated, echoed in logs
        payload = {
            "prompt":     prompt[:_MAX_PAYLOAD_CHARS],
            "response":   response[:_MAX_PAYLOAD_CHARS],
            "metadata":   config.metadata,
            "request_id": request_id,
        }
        ver = _sdk_version()
        headers = {
            "Authorization":  f"Bearer {self._api_key}",
            "Content-Type":   "application/json",
            "User-Agent":     f"veldrixai-python/{ver}",
            "X-Request-ID":   request_id,
            "X-SDK-Version":  ver,
        }
        url         = f"{self._base_url}/api/v1/analyze"
        t0          = time.monotonic()
        last_exc:    Exception | None = None
        last_status: int | None       = None

        for attempt in range(MAX_RETRIES):
            try:
                resp = await client.post(url, json=payload, headers=headers)

                if resp.status_code == 401:
                    raise VeldrixAuthError("Invalid API key. Check your Veldrix dashboard.")

                if resp.status_code in (429, 503):
                    last_status = resp.status_code
                    # Respect Retry-After header if present, capped to prevent runaway sleeps
                    retry_after = resp.headers.get("retry-after") or resp.headers.get("x-retry-after")
                    try:
                        wait = min(float(retry_after), _MAX_RETRY_AFTER)
                    except (TypeError, ValueError):
                        wait = min(BASE_BACKOFF * (2 ** attempt), _MAX_RETRY_AFTER)
                    reason = "rate limited" if resp.status_code == 429 else "service unavailable"
                    logger.warning(
                        "VeldrixAI %s (attempt %d/%d), retrying in %.1fs [req=%s]",
                        reason, attempt + 1, MAX_RETRIES, wait, request_id,
                    )
                    await asyncio.sleep(wait)
                    continue

                resp.raise_for_status()

                data   = resp.json()
                result = _parse_trust_result(data, int((time.monotonic() - t0) * 1000))
                self._breaker.record_success()
                return result

            except VeldrixAuthError:
                raise
            except httpx.TimeoutException as e:
                logger.warning(
                    "VeldrixAI timeout (attempt %d/%d) [req=%s]: %s",
                    attempt + 1, MAX_RETRIES, request_id, e,
                )
                self._breaker.record_failure()
                last_exc = e
                await asyncio.sleep(min(BASE_BACKOFF * (2 ** attempt), _MAX_RETRY_AFTER))
            except Exception as e:
                logger.warning(
                    "VeldrixAI transport error (attempt %d/%d) [req=%s]: %s",
                    attempt + 1, MAX_RETRIES, request_id, e,
                )
                self._breaker.record_failure()
                last_exc = e
                await asyncio.sleep(min(BASE_BACKOFF * (2 ** attempt), _MAX_RETRY_AFTER))

        # All retries exhausted — apply exception contract
        if isinstance(last_exc, httpx.TimeoutException):
            if not config.background:
                raise VeldrixTimeoutError(
                    f"VeldrixAI did not respond within {self._timeout}s after "
                    f"{MAX_RETRIES} retries. Set background=True to silence this."
                ) from last_exc
            logger.error(
                "VeldrixAI timeout after %d retries (non-fatal, background=True): %s",
                MAX_RETRIES, last_exc,
            )
            return _degraded_trust_result(f"timeout: {last_exc}")

        if isinstance(last_exc, httpx.HTTPStatusError):
            if not config.background:
                raise VeldrixAPIError(
                    f"VeldrixAI returned {last_exc.response.status_code} after "
                    f"{MAX_RETRIES} retries.",
                    status_code=last_exc.response.status_code,
                ) from last_exc
            logger.error(
                "VeldrixAI API error after %d retries (non-fatal, background=True): %s",
                MAX_RETRIES, last_exc,
            )
            return _degraded_trust_result(f"api_error: {last_exc}")

        if last_status is not None:
            # Exhausted retries due to 429/503 without raising HTTPStatusError
            if not config.background:
                raise VeldrixAPIError(
                    f"VeldrixAI returned {last_status} after {MAX_RETRIES} retries.",
                    status_code=last_status,
                )
            logger.error(
                "VeldrixAI API error after %d retries (non-fatal, background=True): status=%s",
                MAX_RETRIES, last_status,
            )
            return _degraded_trust_result(f"api_error: {last_status}")

        # All other errors — always degrade silently
        logger.error("VeldrixAI unexpected error (non-fatal): %s", last_exc)
        return _degraded_trust_result(str(last_exc))

    def evaluate_sync(
        self,
        prompt:   str,
        response: str,
        config:   GuardConfig,
    ) -> TrustResult:
        """
        Synchronous evaluate() for use in sync contexts or from inside a running event loop.
        Always creates its own event loop + fresh client — never shares with other threads.
        """
        result_holder: list[TrustResult] = []
        exc_holder:    list[Exception]   = []

        def _run():
            loop   = asyncio.new_event_loop()
            client = None
            try:
                client = self._make_fresh_client()
                result_holder.append(
                    loop.run_until_complete(
                        self.evaluate_with_client(client, prompt, response, config)
                    )
                )
            except Exception as e:
                exc_holder.append(e)
            finally:
                if client is not None:
                    try:
                        loop.run_until_complete(client.aclose())
                    except Exception:
                        pass
                try:
                    loop.close()
                except Exception:
                    pass

        t = threading.Thread(target=_run, daemon=True)
        t.start()
        # Fix — Issue 3: join timeout must cover the full retry budget.
        # MAX_RETRIES attempts × (per-request timeout + max backoff) + 5s buffer.
        join_timeout = MAX_RETRIES * (self._timeout + BASE_BACKOFF * 4) + 5.0
        t.join(timeout=join_timeout)
        if exc_holder:
            raise exc_holder[0]
        if result_holder:
            return result_holder[0]
        return _degraded_trust_result("evaluate_sync timed out")

    async def close(self):
        """Gracefully shut down the transport. Cancel drain worker, close HTTP client."""
        if self._drain_task is not None and not self._drain_task.done():
            self._drain_task.cancel()
            try:
                await self._drain_task
            except asyncio.CancelledError:
                pass
        if (
            self._client is not _UNSET
            and isinstance(self._client, httpx.AsyncClient)
            and not self._client.is_closed
        ):
            await self._client.aclose()


def _parse_trust_result(data: dict, latency_ms: int) -> TrustResult:
    ts      = data.get("trust_score", {})
    pillars = data.get("pillars", {})

    pillar_list = []
    for name, detail in pillars.items():
        pillar_list.append(PillarScore(
            name=name,
            score=detail.get("score"),
            flags=detail.get("flags", []),
            latency_ms=detail.get("latency_ms"),
            error=detail.get("error"),
        ))

    return TrustResult(
        overall=ts.get("overall", 0.0),
        verdict=ts.get("verdict", "UNKNOWN"),
        pillar_scores=ts.get("pillar_scores", {}),
        pillars=pillar_list,
        critical_flags=ts.get("critical_flags", []),
        all_flags=ts.get("all_flags", []),
        request_id=data.get("request_id", ""),
        latency_ms=latency_ms,
    )


def _degraded_trust_result(error: str) -> TrustResult:
    return TrustResult(
        overall=0.0,
        verdict="UNKNOWN",
        pillar_scores={},
        pillars=[PillarScore(name="evaluation", score=None, error=error[:200])],
        critical_flags=[],
        all_flags=[f"evaluation_failed: {error[:120]}"],
        request_id="",
        latency_ms=0,
    )


def _pending_trust_result() -> TrustResult:
    """
    Returned immediately when background=True — evaluation is in-flight via the queue.
    The trust scores arrive in the dashboard regardless.
    Developers who need scores synchronously should use background=False.
    """
    return TrustResult(
        overall=0.0,
        verdict="PENDING",
        pillar_scores={},
        request_id="pending",
        latency_ms=0,
    )
