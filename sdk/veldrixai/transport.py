"""
VeldrixAI Transport Layer
Sends prompt+response to the VeldrixAI API and returns a TrustResult.
All communication is async httpx. Failures are logged and never raised to the developer
unless background=False is explicitly set.
"""

from __future__ import annotations
import asyncio
import logging
import threading
import time
from typing import Optional

import httpx

from veldrixai.models     import TrustResult, PillarScore, GuardConfig
from veldrixai.exceptions import (
    VeldrixAuthError, VeldrixAPIError, VeldrixTimeoutError, VeldrixServiceUnavailableError,
)
from veldrixai._transport.rate_limiter import TokenBucket, BoundedDispatchQueue, ClientCircuitBreaker

logger = logging.getLogger("veldrix.transport")

DEFAULT_BASE_URL = "https://api.veldrix.ai"
MAX_RETRIES      = 3
BASE_BACKOFF     = 0.4


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
        self._client: Optional[httpx.AsyncClient] = None
        self._lock = threading.Lock()
        # Rate limiting primitives
        self._bucket = TokenBucket(capacity=rate_limit_burst, refill_rate=rate_limit_rps)
        self._queue  = BoundedDispatchQueue(max_size=queue_max_size, on_overflow=queue_overflow_policy)
        self._breaker = ClientCircuitBreaker(
            threshold=client_breaker_threshold,
            recovery_seconds=client_breaker_recovery_seconds,
        )

    def stats(self) -> dict:
        """Live counters for observability."""
        q = self._queue.stats()
        b = self._breaker.stats()
        return {
            "queue_depth":          q["depth"],
            "queue_dropped_total":  q["dropped_total"],
            "rate_limited_total":   self._bucket.throttle_count,
            "breaker_state":        b["breaker_state"],
            "breaker_trips_total":  b["breaker_trips_total"],
        }

    def _get_client(self) -> httpx.AsyncClient:
        """
        Returns the shared singleton AsyncClient for use in async contexts
        where the event loop is stable (async call paths).
        Do NOT use this from background threads — use _make_fresh_client() instead.
        """
        if self._client is None or self._client.is_closed:
            with self._lock:
                # Double-check after acquiring lock
                if self._client is None or self._client.is_closed:
                    self._client = httpx.AsyncClient(
                        timeout=httpx.Timeout(connect=5.0, read=self._timeout, write=5.0, pool=2.0),
                        limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
                    )
        return self._client

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

    async def evaluate(
        self,
        prompt:   str,
        response: str,
        config:   GuardConfig,
    ) -> TrustResult:
        """
        Evaluate a prompt+response pair against the VeldrixAI trust API.

        Exception contract:
          - VeldrixAuthError:    ALWAYS raised (401 response). Invalid API key.
          - VeldrixTimeoutError: Raised only when config.background=False.
                                 Silent degradation when background=True.
          - VeldrixAPIError:     Raised only when config.background=False (5xx / exhausted retries).
                                 Silent degradation when background=True.
          - All other errors:    Always silent. Returns degraded TrustResult.

        The degraded TrustResult has verdict="UNKNOWN" and overall=0.0.
        It is always distinguishable: trust.is_degraded == True.
        """
        # Client-side circuit breaker check
        if self._breaker.is_open():
            self._breaker.record_drop()
            if not config.background:
                raise VeldrixServiceUnavailableError(
                    "VeldrixAI client circuit breaker is OPEN — backend is degraded. "
                    f"Retry after {self._breaker._recovery}s or check veldrix.stats()."
                )
            logger.debug("veldrix breaker OPEN: dropping background evaluation")
            return _degraded_trust_result("client_breaker_open")

        # Token bucket rate limiting
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

        return await self.evaluate_with_client(self._get_client(), prompt, response, config)

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
        payload = {
            "prompt":   prompt[:8000],
            "response": response[:8000],
            "metadata": config.metadata,
        }
        ver = _sdk_version()
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type":  "application/json",
            "User-Agent":    f"veldrixai-python/{ver}",
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
                    wait   = BASE_BACKOFF * (2 ** attempt)
                    reason = "rate limited" if resp.status_code == 429 else "service unavailable"
                    logger.warning("VeldrixAI %s, retry %d in %.1fs", reason, attempt + 1, wait)
                    await asyncio.sleep(wait)
                    continue
                resp.raise_for_status()

                data = resp.json()
                result = _parse_trust_result(data, int((time.monotonic() - t0) * 1000))
                self._breaker.record_success()
                return result

            except VeldrixAuthError:
                raise
            except httpx.TimeoutException as e:
                logger.warning("VeldrixAI timeout attempt %d: %s", attempt + 1, e)
                self._breaker.record_failure()
                last_exc = e
                await asyncio.sleep(BASE_BACKOFF * (2 ** attempt))
            except Exception as e:
                logger.warning("VeldrixAI transport error attempt %d: %s", attempt + 1, e)
                self._breaker.record_failure()
                last_exc = e
                await asyncio.sleep(BASE_BACKOFF * (2 ** attempt))

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
        t.join(timeout=self._timeout + 5)
        if exc_holder:
            raise exc_holder[0]
        if result_holder:
            return result_holder[0]
        return _degraded_trust_result("evaluate_sync timed out")

    async def close(self):
        if self._client and not self._client.is_closed:
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
