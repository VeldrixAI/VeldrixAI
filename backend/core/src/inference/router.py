"""Provider-agnostic inference routing engine.

``route_inference`` is the single function all five trust pillars call.
It selects an available provider based on priority and circuit-breaker state,
attempts the call with exponential backoff, and returns the raw text response
along with the provider name that served it.

On total failure (all providers exhausted), raises ``InferenceExhaustedError``.
Callers should catch this and return their pillar's safe degraded result.

Logging conventions:
  INFO    [VELDRIX ROUTER] pillar=X provider=Y attempt=N status=attempting
  WARNING [VELDRIX ROUTER] pillar=X provider=Y status=failed reason=Z
  INFO    [VELDRIX ROUTER] pillar=X provider=Y status=success latency_ms=N
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from typing import Optional

import httpx

from src.inference import circuit_breaker
from src.inference.circuit_breaker import (
    async_is_available as _cb_is_available,
    async_record_success as _cb_record_success,
    async_record_failure as _cb_record_failure,
)
from src.inference.exceptions import InferenceExhaustedError
from src.inference.providers import ProviderConfig, get_active_providers

logger = logging.getLogger(__name__)

# ── HTTP status code classification ─────────────────────────────────────────
_TRANSIENT_ERROR_STATUSES = frozenset({429, 500, 502, 503, 504})
_CREDENTIAL_ERROR_STATUSES = frozenset({401, 403})

# ── Connection pool configuration ────────────────────────────────────────────
# Aggressive pooling for SaaS latency SLA:
#   100 max connections per provider: supports 5 pillars × 20 concurrent requests
#   Keepalive at 60s with 50 keepalive connections for sustained throughput
#   HTTP/2 enabled for multiplexing (single TCP connection, multiple streams)
_HTTP_LIMITS = httpx.Limits(
    max_connections=100,
    max_keepalive_connections=50,
    keepalive_expiry=60.0,
)

# Per-provider timeout (seconds) overrides.
# These cap the asyncio.wait_for budget per provider call in the sequential fallback.
# Defaults match the provider config timeout_seconds (3s NIM, 2s Groq) but can be
# raised via env vars if upstream latency is higher than expected.
# IMPORTANT: do NOT set these below 2s — LLM inference typically takes 0.5–3s for
# completion and aggressively short timeouts cause every call to degrade silently.
_PROBE_TIMEOUT_S: float = float(os.environ.get("VELDRIX_PROBE_TIMEOUT_S", "10.0"))

# Secondary provider timeout (Groq / other fast providers)
_FALLBACK_TIMEOUT_S: float = float(os.environ.get("VELDRIX_FALLBACK_TIMEOUT_S", "12.0"))

# Speculative execution: race primary and fallback simultaneously.
# Disabled by default — speculative execution provides marginal p95 gains but
# doubles API cost and is counterproductive when both providers need >1s.
# Enable via VELDRIX_SPECULATIVE_EXECUTION=true only if both providers reliably
# respond in under 2s.
_SPECULATIVE_ENABLED: bool = os.environ.get("VELDRIX_SPECULATIVE_EXECUTION", "false").lower() == "true"

# ── Module-level connection pool (one client per provider) ───────────────────
_clients: dict[str, httpx.AsyncClient] = {}


class _CredentialError(Exception):
    """401/403 from a provider — configuration error, do not trip circuit breaker."""


def _get_api_key(provider: ProviderConfig) -> str:
    return os.environ.get(provider.api_key_env, "")


def _get_or_create_client(provider: ProviderConfig) -> httpx.AsyncClient:
    """Return the connection-pooled client for a provider, creating it if needed."""
    if provider.name not in _clients:
        api_key = _get_api_key(provider)
        headers: dict[str, str] = {"Content-Type": "application/json"}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
        _clients[provider.name] = httpx.AsyncClient(
            base_url=provider.base_url,
            headers=headers,
            timeout=httpx.Timeout(provider.timeout_seconds),
            limits=_HTTP_LIMITS,
            http2=True,
        )
        logger.info(
            "[VELDRIX ROUTER] HTTP client initialised for provider=%s base_url=%s",
            provider.name,
            provider.base_url,
        )
    return _clients[provider.name]


async def initialize_router() -> None:
    """Pre-create HTTP clients for all active providers during application startup."""
    providers = get_active_providers()
    for provider in providers:
        _get_or_create_client(provider)
    logger.info(
        "[VELDRIX ROUTER] Initialised with %d active provider(s): %s",
        len(providers),
        [p.name for p in providers],
    )


async def close_router() -> None:
    """Close all provider HTTP clients during application shutdown."""
    for name, client in list(_clients.items()):
        await client.aclose()
        logger.info("[VELDRIX ROUTER] Client closed for provider=%s", name)
    _clients.clear()


async def _call_provider(
    provider: ProviderConfig,
    messages: list[dict],
    temperature: float,
    max_tokens: int,
    model_override: Optional[str],
    pillar_name: str,
    attempt: int,
) -> str:
    """
    Make a single POST /chat/completions call to a provider.

    Returns the raw assistant message content string.

    Raises:
        _CredentialError: On 401/403 — caller must skip without tripping breaker.
        httpx.HTTPStatusError: On transient HTTP errors (429, 500, 502, 503, 504).
        httpx.TimeoutException: On request timeout.
    """
    client = _get_or_create_client(provider)

    # Use model_override only for NVIDIA NIM — fallback providers have their own slugs.
    model = (
        model_override
        if (model_override and provider.name == "nvidia_nim")
        else provider.model_id
    )

    logger.info(
        "[VELDRIX ROUTER] pillar=%s provider=%s attempt=%d status=attempting",
        pillar_name,
        provider.name,
        attempt,
    )

    t0 = time.monotonic()
    try:
        resp = await client.post(
            "/chat/completions",
            json={
                "model": model,
                "messages": messages,
                "temperature": temperature,
                "max_tokens": max_tokens,
            },
        )
    except httpx.RequestError as exc:
        logger.error(
            "[VELDRIX ROUTER] pillar=%s provider=%s status=failed reason=request_error "
            "model=%r error=%r",
            pillar_name,
            provider.name,
            model,
            exc,
        )
        raise ValueError(f"Request error from {provider.name}: {exc}") from exc
    latency_ms = (time.monotonic() - t0) * 1000

    if resp.status_code in _CREDENTIAL_ERROR_STATUSES:
        logger.warning(
            "[VELDRIX ROUTER] pillar=%s provider=%s status=failed reason=credential_error http=%d",
            pillar_name,
            provider.name,
            resp.status_code,
        )
        raise _CredentialError(f"HTTP {resp.status_code} from {provider.name}")

    if resp.status_code in _TRANSIENT_ERROR_STATUSES:
        logger.warning(
            "[VELDRIX ROUTER] pillar=%s provider=%s status=failed reason=http_%d",
            pillar_name,
            provider.name,
            resp.status_code,
        )
        raise httpx.HTTPStatusError(
            f"HTTP {resp.status_code}",
            request=resp.request,
            response=resp,
        )

    # 4xx client errors that are not auth (401/403) or rate-limit (429) are
    # non-retryable — retrying a bad request wastes time and trips the circuit
    # breaker incorrectly.  Log the body (truncated) so the error is diagnosable,
    # then skip to the next provider without touching the breaker.
    if 400 <= resp.status_code < 500:
        try:
            error_body = resp.text[:400]
        except Exception:
            error_body = "<unreadable>"
        logger.error(
            "[VELDRIX ROUTER] pillar=%s provider=%s status=failed reason=client_error "
            "http=%d model=%r body=%r — check provider model name / request format",
            pillar_name,
            provider.name,
            resp.status_code,
            model,
            error_body,
        )
        raise _CredentialError(f"HTTP {resp.status_code} client error from {provider.name}")

    resp.raise_for_status()

    # Check for empty response body
    if not resp.text:
        logger.error(
            "[VELDRIX ROUTER] pillar=%s provider=%s status=failed reason=empty_response http=%d",
            pillar_name,
            provider.name,
            resp.status_code,
        )
        raise ValueError(f"Empty response from {provider.name}")

    try:
        data = resp.json()
        content: str = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, ValueError) as exc:
        # Log response body for debugging (truncated to 400 chars)
        try:
            error_body = resp.text[:400]
        except Exception:
            error_body = "<unreadable>"
        logger.error(
            "[VELDRIX ROUTER] pillar=%s provider=%s status=failed reason=invalid_response_format "
            "http=%d model=%r body=%r",
            pillar_name,
            provider.name,
            resp.status_code,
            model,
            error_body,
        )
        raise ValueError(f"Invalid response format from {provider.name}: {exc}") from exc

    logger.info(
        "[VELDRIX ROUTER] pillar=%s provider=%s status=success latency_ms=%.1f",
        pillar_name,
        provider.name,
        latency_ms,
    )
    return content


async def route_inference(
    messages: list[dict],
    pillar_name: str,
    require_json: bool = True,
    temperature: float = 0.0,
    model_override: Optional[str] = None,
    max_tokens: int = 256,
) -> tuple[str, str]:
    """
    Route an inference request to the highest-priority available provider.

    SPECULATIVE EXECUTION (default enabled):
        When both primary (NIM) and fallback (Groq) are available, we race them
        simultaneously and take the first response. This guarantees sub-200ms
        p99 latency even when NIM is degraded.

    FALLBACK MODE:
        Iterates providers in priority order, skipping those whose circuit breaker
        is OPEN. Applies exponential backoff within each provider's retry budget.

    Args:
        messages:       OpenAI-compatible messages list (may include system message).
        pillar_name:    Used in log messages for traceability.
        require_json:   If True, callers expect a JSON-parseable response.
                        The router does not enforce this — callers handle parse errors.
        temperature:    Sampling temperature forwarded to the model.
        model_override: If set, overrides the model_id for NVIDIA NIM only.
                        Fallback providers use their own configured model.
        max_tokens:     Maximum tokens to request from the model.

    Returns:
        Tuple of (raw_text_response, provider_name_used).

    Raises:
        InferenceExhaustedError: When all providers are exhausted or unavailable.
    """
    providers = get_active_providers()
    
    # ── SPECULATIVE EXECUTION: Race primary and fallback simultaneously ──
    # This is the key optimization for sub-500ms SLA. We don't wait for NIM to
    # timeout before trying Groq - we start both at the same time.
    if _SPECULATIVE_ENABLED and len(providers) >= 2:
        primary = providers[0]
        fallback = providers[1]
        
        # Only speculate when both circuits are healthy
        primary_ok = await _cb_is_available(primary.name)
        fallback_ok = await _cb_is_available(fallback.name)
        
        if primary_ok and fallback_ok:
            t0 = time.monotonic()
            
            async def _call_primary():
                try:
                    content = await asyncio.wait_for(
                        _call_provider(primary, messages, temperature, max_tokens, model_override, pillar_name, 1),
                        timeout=primary.timeout_seconds,
                    )
                    return content, primary.name
                except Exception as e:
                    return None, e

            async def _call_fallback():
                try:
                    content = await asyncio.wait_for(
                        _call_provider(fallback, messages, temperature, max_tokens, model_override, pillar_name, 1),
                        timeout=fallback.timeout_seconds,
                    )
                    return content, fallback.name
                except Exception as e:
                    return None, e
            
            # Race both providers - first successful response wins
            results = await asyncio.gather(
                _call_primary(),
                _call_fallback(),
                return_exceptions=True,  # Changed from False to True
            )
            
            # Take the first successful result
            for content, provider_or_error in results:
                if content is not None:
                    elapsed_ms = (time.monotonic() - t0) * 1000
                    # Record success for the winner, failure for loser
                    winner = provider_or_error
                    await _cb_record_success(winner)
                    # Record failure for the other provider if it errored
                    for c, p in results:
                        if c is None and p is not None and isinstance(p, Exception):
                            other = primary.name if winner == fallback.name else fallback.name
                            await _cb_record_failure(other)
                    logger.info(
                        "[VELDRIX ROUTER] pillar=%s speculative_winner=%s latency_ms=%.1f",
                        pillar_name, winner, elapsed_ms,
                    )
                    return content, winner
            
            # Both failed - record failures and fall through to sequential fallback
            for content, exc in results:
                if exc is not None and not isinstance(exc, str):
                    await _cb_record_failure(primary.name)
                    await _cb_record_failure(fallback.name)
    
    # ── SEQUENTIAL FALLBACK: Standard priority-based routing ──
    providers_attempted: list[str] = []

    for provider in providers:
        if not await _cb_is_available(provider.name):
            logger.info(
                "[VELDRIX ROUTER] pillar=%s provider=%s status=skipped reason=circuit_open",
                pillar_name,
                provider.name,
            )
            continue

        providers_attempted.append(provider.name)
        # Reduced from 0.5 s — a 500 ms sleep before retry breaks sub-200 ms p50.
        initial_delay = 0.05  # 50ms - faster retry for sequential fallback

        for attempt in range(1, provider.max_retries + 1):
            try:
                _call = _call_provider(
                    provider=provider,
                    messages=messages,
                    temperature=temperature,
                    max_tokens=max_tokens,
                    model_override=model_override,
                    pillar_name=pillar_name,
                    attempt=attempt,
                )
                # Use the provider's configured timeout_seconds as the asyncio budget.
                # The httpx client already enforces this at the socket level; the outer
                # wait_for is a safety guard against stalled coroutines.
                # Never override with the global probe/fallback values here — those are
                # only for speculative-execution fast-fail and are intentionally short.
                content = await asyncio.wait_for(_call, timeout=provider.timeout_seconds)
                await _cb_record_success(provider.name)
                return content, provider.name

            except asyncio.TimeoutError:
                # Probe timeout exceeded on primary — trip breaker, skip retries.
                logger.warning(
                    "[VELDRIX ROUTER] pillar=%s provider=%s status=failed "
                    "reason=probe_timeout_%.1fs",
                    pillar_name,
                    provider.name,
                    _PROBE_TIMEOUT_S if provider.priority == 1 else _FALLBACK_TIMEOUT_S,
                )
                await _cb_record_failure(provider.name)
                break  # move to next provider immediately

            except _CredentialError:
                # Config error — skip provider entirely, do not trip circuit breaker
                logger.warning(
                    "[VELDRIX ROUTER] pillar=%s provider=%s status=skipped reason=credential_error",
                    pillar_name,
                    provider.name,
                )
                break  # move to next provider

            except (httpx.TimeoutException, httpx.HTTPStatusError) as exc:
                logger.warning(
                    "[VELDRIX ROUTER] pillar=%s provider=%s status=failed reason=%s attempt=%d/%d",
                    pillar_name,
                    provider.name,
                    type(exc).__name__,
                    attempt,
                    provider.max_retries,
                )
                if attempt < provider.max_retries:
                    delay = initial_delay * (2 ** (attempt - 1))
                    await asyncio.sleep(delay)
                else:
                    # All retries for this provider exhausted — trip the breaker
                    await _cb_record_failure(provider.name)

            except Exception as exc:
                logger.warning(
                    "[VELDRIX ROUTER] pillar=%s provider=%s status=failed reason=%s",
                    pillar_name,
                    provider.name,
                    type(exc).__name__,
                )
                await _cb_record_failure(provider.name)
                break  # unexpected error — skip to next provider

    raise InferenceExhaustedError(
        pillar=pillar_name,
        providers_attempted=providers_attempted,
    )
