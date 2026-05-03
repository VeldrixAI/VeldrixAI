import pytest
import respx
import httpx
from veldrixai.transport import Transport, _degraded_trust_result
from veldrixai.models    import GuardConfig

API_KEY  = "vx-test-key-123"
BASE_URL = "https://api.veldrix.ai"

MOCK_RESPONSE = {
    "request_id":  "req_abc123",
    "trust_score": {
        "overall":        0.92,
        "verdict":        "ALLOW",
        "pillar_scores":  {"safety": 0.95},
        "critical_flags": [],
        "all_flags":      [],
    },
    "pillars": {
        "safety": {"score": 0.95, "flags": [], "latency_ms": 120, "status": "ok"}
    },
    "total_latency_ms": 310,
    "sdk_version": "1.0.0",
}


@pytest.mark.asyncio
@respx.mock
async def test_transport_returns_trust_result():
    respx.post(f"{BASE_URL}/api/v1/analyze").mock(
        return_value=httpx.Response(200, json=MOCK_RESPONSE)
    )
    t     = Transport(API_KEY, BASE_URL)
    trust = await t.evaluate("hello", "world", GuardConfig(background=False))
    assert trust.verdict    == "ALLOW"
    assert trust.overall    == 0.92
    assert trust.request_id == "req_abc123"
    await t.close()


@pytest.mark.asyncio
@respx.mock
async def test_transport_degrades_on_500_when_background():
    """A 500 must return a degraded TrustResult, never raise.
    Tests evaluate_with_client() directly — the queue path returns PENDING
    immediately and the actual HTTP call happens inside the drain worker.
    """
    respx.post(f"{BASE_URL}/api/v1/analyze").mock(return_value=httpx.Response(500))

    t      = Transport(API_KEY, BASE_URL, timeout_ms=500)
    client = t._make_fresh_client()
    trust  = await t.evaluate_with_client(client, "hello", "world", GuardConfig(background=True))
    assert trust.verdict == "UNKNOWN"
    await client.aclose()
    await t.close()


@pytest.mark.asyncio
@respx.mock
async def test_transport_raises_on_401():
    """Auth errors must always surface — never be swallowed."""
    respx.post(f"{BASE_URL}/api/v1/analyze").mock(return_value=httpx.Response(401))

    from veldrixai.exceptions import VeldrixAuthError
    t = Transport(API_KEY, BASE_URL)
    with pytest.raises(VeldrixAuthError):
        await t.evaluate("hello", "world", GuardConfig(background=False))
    await t.close()


# ── Fix 6 — Exception contract ───────────────────────────────────────────────

@pytest.mark.asyncio
@respx.mock
async def test_timeout_raises_when_foreground():
    """VeldrixTimeoutError must be raised when background=False and timeout occurs."""
    from veldrixai.exceptions import VeldrixTimeoutError

    respx.post(f"{BASE_URL}/api/v1/analyze").mock(
        side_effect=httpx.TimeoutException("timed out")
    )
    t      = Transport(API_KEY, BASE_URL, timeout_ms=500)
    config = GuardConfig(background=False)

    with pytest.raises(VeldrixTimeoutError):
        await t.evaluate("prompt", "response", config)
    await t.close()


@pytest.mark.asyncio
@respx.mock
async def test_timeout_degrades_silently_when_background():
    """Timeout must NEVER raise — returns degraded result.
    Tests evaluate_with_client() directly — the queue path returns PENDING
    immediately and the actual HTTP call happens inside the drain worker.
    """
    respx.post(f"{BASE_URL}/api/v1/analyze").mock(
        side_effect=httpx.TimeoutException("timed out")
    )
    t      = Transport(API_KEY, BASE_URL, timeout_ms=500)
    client = t._make_fresh_client()
    trust  = await t.evaluate_with_client(client, "prompt", "response", GuardConfig(background=True))
    assert trust.verdict == "UNKNOWN"
    assert trust.is_degraded is True
    await client.aclose()
    await t.close()


@pytest.mark.asyncio
@respx.mock
async def test_5xx_raises_when_foreground():
    """VeldrixAPIError must be raised on 5xx when background=False."""
    from veldrixai.exceptions import VeldrixAPIError

    respx.post(f"{BASE_URL}/api/v1/analyze").mock(
        return_value=httpx.Response(500, json={"detail": "internal server error"})
    )
    t      = Transport(API_KEY, BASE_URL)
    config = GuardConfig(background=False)

    with pytest.raises(VeldrixAPIError) as exc_info:
        await t.evaluate("prompt", "response", config)
    assert exc_info.value.status_code == 500
    await t.close()


@pytest.mark.asyncio
@respx.mock
async def test_503_raises_when_foreground():
    """VeldrixAPIError must be raised when 503 exhausts all retries with background=False."""
    from veldrixai.exceptions import VeldrixAPIError

    respx.post(f"{BASE_URL}/api/v1/analyze").mock(
        return_value=httpx.Response(503, json={"detail": "service unavailable"})
    )
    t      = Transport(API_KEY, BASE_URL)
    config = GuardConfig(background=False)

    with pytest.raises(VeldrixAPIError) as exc_info:
        await t.evaluate("prompt", "response", config)
    assert exc_info.value.status_code == 503
    await t.close()


@pytest.mark.asyncio
@respx.mock
async def test_5xx_degrades_silently_when_background():
    """5xx must NEVER raise — returns degraded result.
    Tests evaluate_with_client() directly — the queue path returns PENDING
    immediately and the actual HTTP call happens inside the drain worker.
    """
    respx.post(f"{BASE_URL}/api/v1/analyze").mock(
        return_value=httpx.Response(500)
    )
    t      = Transport(API_KEY, BASE_URL)
    client = t._make_fresh_client()
    trust  = await t.evaluate_with_client(client, "prompt", "response", GuardConfig(background=True))
    assert trust.verdict == "UNKNOWN"
    await client.aclose()
    await t.close()


def test_degraded_trust_result_is_always_distinguishable():
    """Developers must be able to detect evaluation failures."""
    trust = _degraded_trust_result("test error")
    assert trust.verdict    == "UNKNOWN"
    assert trust.overall    == 0.0
    assert trust.passed     is False
    assert trust.blocked    is False
    assert trust.is_degraded is True


# ── Fix 5 — evaluate_sync() inside a running event loop ─────────────────────

@pytest.mark.asyncio
async def test_evaluate_sync_inside_running_event_loop():
    """
    evaluate_sync() called from inside an async context (running event loop)
    must work correctly — not deadlock, not raise 'cannot run nested event loop'.
    This is the exact Jupyter / Django async / pytest-asyncio scenario.
    """
    mock_resp = {
        "request_id":  "req_nested_loop",
        "trust_score": {
            "overall": 0.88, "verdict": "ALLOW",
            "pillar_scores": {"safety": 0.92},
            "critical_flags": [], "all_flags": [],
        },
        "pillars": {},
        "total_latency_ms": 150,
        "sdk_version": "1.0.0",
    }

    with respx.mock(base_url=BASE_URL) as rx:
        rx.post("/api/v1/analyze").mock(
            return_value=httpx.Response(200, json=mock_resp)
        )
        t      = Transport("vx-test-nested", BASE_URL)
        config = GuardConfig(background=False)

        # Critical: we ARE inside an async context (asyncio running)
        # evaluate_sync() must use thread isolation, not asyncio.run()
        trust = t.evaluate_sync("test prompt", "test response", config)

        assert trust.verdict     == "ALLOW"
        assert trust.overall     == 0.88
        assert trust.request_id  == "req_nested_loop"
        await t.close()


@pytest.mark.asyncio
async def test_evaluate_sync_concurrent_from_running_loop():
    """
    Multiple concurrent evaluate_sync() calls from inside an async context
    must all complete without deadlock.
    """
    import asyncio

    mock_resp = {
        "request_id": "req_concurrent_nested",
        "trust_score": {
            "overall": 0.90, "verdict": "ALLOW",
            "pillar_scores": {}, "critical_flags": [], "all_flags": [],
        },
        "pillars": {}, "total_latency_ms": 100, "sdk_version": "1.0.0",
    }

    with respx.mock(base_url=BASE_URL) as rx:
        rx.post("/api/v1/analyze").mock(
            return_value=httpx.Response(200, json=mock_resp)
        )
        t      = Transport("vx-test-concurrent-nested", BASE_URL)
        config = GuardConfig(background=False)

        # Run 5 concurrent evaluate_sync calls from async context
        results = await asyncio.gather(*[
            asyncio.get_event_loop().run_in_executor(
                None, t.evaluate_sync, f"prompt {i}", f"response {i}", config
            )
            for i in range(5)
        ])

        assert len(results) == 5
        assert all(r.verdict == "ALLOW" for r in results)
        await t.close()


# ── Fix 8.5 — is_degraded / passed / blocked / needs_review ──────────────────

def test_degraded_trust_result_is_detectable():
    from veldrixai.transport import _degraded_trust_result

    trust = _degraded_trust_result("network error")
    assert trust.is_degraded  is True
    assert trust.passed        is False
    assert trust.blocked       is False
    assert trust.needs_review  is False


def test_allow_trust_result_not_degraded():
    from veldrixai.models import TrustResult

    trust = TrustResult(
        overall=0.94, verdict="ALLOW",
        pillar_scores={"safety": 0.97},
        request_id="req_123", latency_ms=200,
    )
    assert trust.is_degraded  is False
    assert trust.passed        is True
    assert trust.blocked       is False
    assert trust.needs_review  is False


def test_warn_verdict_needs_review():
    from veldrixai.models import TrustResult

    trust = TrustResult(
        overall=0.6, verdict="WARN",
        pillar_scores={}, request_id="req_warn", latency_ms=100,
    )
    assert trust.needs_review is True
    assert trust.passed       is False
    assert trust.is_degraded  is False
