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
from src.inference.exceptions import InferenceExhaustedError
from src.inference.providers import ProviderConfig, get_active_providers

logger = logging.getLogger(__name__)

# ── HTTP status code classification ─────────────────────────────────────────
_TRANSIENT_ERROR_STATUSES = frozenset({429, 500, 502, 503, 504})
_CREDENTIAL_ERROR_STATUSES = frozenset({401, 403})

# ── Connection pool configuration ────────────────────────────────────────────
# 20 max connections per provider: supports 5 pillars × 2 concurrent requests
# with headroom.  Keepalive at 30s keeps warm connections for back-to-back
# evaluations without paying TCP+TLS setup cost again.
_HTTP_LIMITS = httpx.Limits(
    max_connections=20,
    max_keepalive_connections=10,
    keepalive_expiry=30.0,
)

# Fast-fail probe timeout for the PRIMARY provider (priority=1, NVIDIA NIM).
# If a single inference call exceeds this threshold, the circuit breaker records
# a failure and the request routes immediately to the next provider.
# Configurable via VELDRIX_PROBE_TIMEOUT_S (default 3.0s).
_PROBE_TIMEOUT_S: float = float(os.environ.get("VELDRIX_PROBE_TIMEOUT_S", "1.0"))

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
    resp = await client.post(
        "/chat/completions",
        json={
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        },
    )
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

    data = resp.json()
    content: str = data["choices"][0]["message"]["content"]

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

    Iterates providers in priority order, skipping those whose circuit breaker
    is OPEN.  Applies exponential backoff within each provider's retry budget.

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
    providers_attempted: list[str] = []

    for provider in providers:
        if not circuit_breaker.is_available(provider.name):
            logger.info(
                "[VELDRIX ROUTER] pillar=%s provider=%s status=skipped reason=circuit_open",
                pillar_name,
                provider.name,
            )
            continue

        providers_attempted.append(provider.name)
        # Reduced from 0.5 s — a 500 ms sleep before retry breaks sub-200 ms p50.
        initial_delay = 0.1  # seconds; doubles per retry

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
                # Apply probe timeout to the primary provider only.
                # If NIM is degraded and responds slowly, fail THIS request
                # fast and route to Groq while the circuit breaker accumulates
                # failures in the background.
                if provider.priority == 1:
                    content = await asyncio.wait_for(_call, timeout=_PROBE_TIMEOUT_S)
                else:
                    content = await _call
                circuit_breaker.record_success(provider.name)
                return content, provider.name

            except asyncio.TimeoutError:
                # Probe timeout exceeded on primary — trip breaker, skip retries.
                logger.warning(
                    "[VELDRIX ROUTER] pillar=%s provider=%s status=failed "
                    "reason=probe_timeout_%.1fs",
                    pillar_name,
                    provider.name,
                    _PROBE_TIMEOUT_S,
                )
                circuit_breaker.record_failure(provider.name)
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
                    circuit_breaker.record_failure(provider.name)

            except Exception as exc:
                logger.warning(
                    "[VELDRIX ROUTER] pillar=%s provider=%s status=failed reason=%s",
                    pillar_name,
                    provider.name,
                    type(exc).__name__,
                )
                circuit_breaker.record_failure(provider.name)
                break  # unexpected error — skip to next provider

    raise InferenceExhaustedError(
        pillar=pillar_name,
        providers_attempted=providers_attempted,
    )
