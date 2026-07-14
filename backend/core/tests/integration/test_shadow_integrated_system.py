"""Phase-6 integrated-system tests — the previously-unreachable failure modes.

RECON-INT.md / §3: these need an integrated environment and were on the Phase-3.5
"still not reached" list. Dev makes them reachable. They exercise the shadow worker
under the conditions that only appear once the engine is connected to a request path:

  * mode-change during in-flight evaluation (no torn state),
  * concurrent ``/metrics`` scrape under worker load (no race, no PII, no request impact),
  * worker back-pressure under sustained load (the runtime primitive sheds + counts; the
    dedicated pool is bounded; nothing queues unboundedly; the shared pool is untouched),
  * the deliberate fault-injection matrix (throw / hang-past-budget / pool-exhaust /
    kill-mid-stream / malformed signals) — for each, the worker stays contained and the
    fault is recorded/counted.

Pure-ish: no live services. The dedicated client, breaker, and (for some tests) the
runtime are injected/monkeypatched; the rest is the real integration code.
"""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest

from src.policy import runtime, shadow_integration as si
from src.policy.runtime import BackpressureError, evaluate
from src.policy.default_shadow_policy import get_default_shadow_policy
from src.policy.schema import Action, EnforcementMode
from src.policy import shadow_pool
from src.telemetry import policy_metrics as metrics


# ── helpers ─────────────────────────────────────────────────────────────────────

def pillar(score, risk, status="success", method="nim_api"):
    return SimpleNamespace(
        status=SimpleNamespace(value=status),
        score=SimpleNamespace(value=score, confidence=0.9, risk_level=None),
        details={"method": method, "nim_risk_score": risk},
        flags=[], execution_time_ms=12.0, error=None,
    )


class FakeResponse:
    def __init__(self, status_code=201, json_body=None, text=""):
        self.status_code = status_code
        self._json = json_body or {}
        self.text = text

    def json(self):
        return self._json


def fills(results):
    async def _c(partial):
        partial.update(results)
    return _c


async def never(partial):
    await asyncio.sleep(10)


@pytest.fixture(autouse=True)
def _reset(monkeypatch):
    async def _all_closed():
        return {}
    monkeypatch.setattr("src.inference.circuit_breaker.async_get_all_states", _all_closed)
    runtime.configure(max_concurrent=64)
    si.invalidate_mode_cache()
    yield
    runtime.configure(max_concurrent=64)
    si.invalidate_mode_cache()


@pytest.fixture
def outcomes(monkeypatch):
    seen = []
    monkeypatch.setattr(metrics, "record_shadow_outcome", lambda o: seen.append(o))
    return seen


# ═══════════════════════════════════════════════════════════════════════════════
#  1. Mode-change during in-flight evaluation — no torn state
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_mode_flip_under_concurrency_yields_no_torn_state(monkeypatch, outcomes):
    """Flip the tenant mode continuously while many evals run; every record must carry a
    single coherent resolved mode and stay non-enforcing — never a torn/partial value."""
    # Disable the mode cache so each eval performs a fresh resolution that can race.
    monkeypatch.setattr(si, "_MODE_CACHE_TTL_S", -1.0)

    flip = {"mode": "shadow"}

    class FlippingClient:
        async def get(self, url, params=None):
            # Toggle on every read to maximise interleaving.
            flip["mode"] = "enforce" if flip["mode"] == "shadow" else "shadow"
            return FakeResponse(200, {"mode": flip["mode"]})

        posts = None

        def __init__(self):
            self.posts = []

        async def post(self, url, json=None):
            self.posts.append(json)
            return FakeResponse(201)

    client = FlippingClient()
    monkeypatch.setattr(si, "get_shadow_client", lambda: client)

    await asyncio.gather(*[
        si._shadow_evaluate(
            pillar_results={"prompt_security": pillar(5, 0.95)},
            composite_score=0.2, tenant_id="t1", request_id=f"r{i}",
        )
        for i in range(40)
    ])

    assert len(client.posts) == 40
    for body in client.posts:
        rec = body["metadata"]
        assert rec["mode"] in ("shadow", "enforce")   # always a coherent resolved mode
        assert rec["enforced"] is False               # never enforced, regardless of mode
        assert rec["integration"] == "shadow"
    assert outcomes.count("written") == 40
    assert "worker_exception" not in outcomes


# ═══════════════════════════════════════════════════════════════════════════════
#  2. Concurrent /metrics scrape under worker load — no race, no PII, no impact
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_concurrent_metrics_scrape_under_load_has_no_pii_and_no_race(monkeypatch):
    client_posts = []

    class Client:
        async def get(self, url, params=None):
            return FakeResponse(404, {})  # → shadow

        async def post(self, url, json=None):
            client_posts.append(json)
            return FakeResponse(201)

    monkeypatch.setattr(si, "get_shadow_client", lambda: Client())

    SECRET_PROMPT = "wire-transfer-to-attacker-IBAN-SECRET"
    tenant = "tenant-PII-7f3c"
    rid = "req-PII-abcdef"

    async def workload():
        await si._shadow_evaluate(
            pillar_results={"safety_toxicity": pillar(20, 0.8)},
            composite_score=0.3, tenant_id=tenant, request_id=rid,
        )

    scrapes = []

    async def scraper():
        for _ in range(25):
            body, ct = metrics.render()
            scrapes.append((body, ct))
            await asyncio.sleep(0)

    # Hammer evaluations and scrapes simultaneously.
    await asyncio.gather(
        *[workload() for _ in range(30)],
        *[scraper() for _ in range(4)],
    )

    assert scrapes, "scrape produced no output"
    for body, ct in scrapes:
        assert isinstance(body, (bytes, bytearray))
        text = body.decode("utf-8", "replace")
        # No governed content / PII / per-request identifiers may ever enter a metric.
        assert SECRET_PROMPT not in text
        assert tenant not in text
        assert rid not in text


# ═══════════════════════════════════════════════════════════════════════════════
#  3. Worker back-pressure under sustained load
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_runtime_primitive_sheds_under_overload():
    """The exact primitive the worker calls (runtime.evaluate) sheds, never queues."""
    runtime.configure(max_concurrent=2)
    try:
        async def one():
            return await evaluate(
                policy=get_default_shadow_policy(),
                signal_collector=fills_then_hold({"safety_toxicity": pillar(95, 0.05)}),
                mode=EnforcementMode.SHADOW,
                budget_ms=300,
                backpressure_wait_ms=20,
                audit_sink=lambda rec: None,
            )

        results = await asyncio.gather(*[one() for _ in range(10)], return_exceptions=True)
        shed = [r for r in results if isinstance(r, BackpressureError)]
        ok = [r for r in results if not isinstance(r, Exception)]
        assert len(shed) >= 6           # surplus sheds
        assert len(ok) <= 2             # gate of 2 honored
        assert len(shed) + len(ok) == 10  # nothing lost, nothing queued unboundedly
    finally:
        runtime.configure(max_concurrent=64)


def fills_then_hold(results):
    async def _c(partial):
        partial.update(results)
        await asyncio.sleep(0.25)  # occupy the gate for ~the budget
    return _c


@pytest.mark.asyncio
async def test_dedicated_pool_is_bounded_and_sheds_excess(monkeypatch, outcomes):
    """Saturate the dedicated pool with concurrent writes; excess sheds + counts, the
    pool's concurrency stays bounded, nothing queues unboundedly, in-flight returns to 0,
    and the SHARED request-path pool is never touched."""
    monkeypatch.setattr(si, "_resolve_mode", _const_mode(EnforcementMode.SHADOW))

    def _boom_shared():
        raise AssertionError("worker touched the shared request-path pool")
    monkeypatch.setattr("src.core.http_pool.get_internal_client", _boom_shared)

    MAX = 3
    state = {"cur": 0, "peak": 0}
    sem = asyncio.Semaphore(MAX)

    class BoundedClient:
        async def get(self, url, params=None):
            return FakeResponse(404, {})

        async def post(self, url, json=None):
            # Simulate a connection pool with a hard ceiling + short acquire timeout:
            # beyond MAX concurrent posts, acquisition times out → PoolTimeout-like error.
            try:
                await asyncio.wait_for(sem.acquire(), timeout=0.05)
            except asyncio.TimeoutError:
                raise RuntimeError("PoolTimeout: dedicated pool exhausted")
            try:
                state["cur"] += 1
                state["peak"] = max(state["peak"], state["cur"])
                await asyncio.sleep(0.05)  # hold the connection
                return FakeResponse(201)
            finally:
                state["cur"] -= 1
                sem.release()

    monkeypatch.setattr(si, "get_shadow_client", lambda: BoundedClient())

    await asyncio.gather(*[
        si._shadow_evaluate(
            pillar_results={"safety_toxicity": pillar(95, 0.05)},
            composite_score=0.9, tenant_id="t1", request_id=f"r{i}",
        )
        for i in range(20)
    ])

    assert state["peak"] <= MAX                  # pool concurrency stayed bounded
    assert outcomes.count("write_failed") >= 1   # surplus shed + counted
    assert outcomes.count("written") >= 1        # some succeeded
    # Every request accounted for exactly once at the write stage — nothing lost/queued.
    assert outcomes.count("written") + outcomes.count("write_failed") == 20
    assert "worker_exception" not in outcomes
    assert shadow_pool.in_flight() == 0          # no in-flight leak


def _const_mode(mode):
    async def _f(_tenant, _policy):
        return mode
    return _f


# ═══════════════════════════════════════════════════════════════════════════════
#  4. Deliberate fault-injection matrix — each fault contained + counted
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
@pytest.mark.parametrize(
    "fault,expected_outcome",
    [
        ("throw", "worker_exception"),
        ("backpressure", "dropped_backpressure"),
        ("pool_exhaust", "write_failed"),
        ("malformed", "written"),
    ],
)
async def test_fault_injection_matrix(monkeypatch, outcomes, fault, expected_outcome):
    monkeypatch.setattr(si, "_resolve_mode", _const_mode(EnforcementMode.SHADOW))

    if fault == "throw":
        async def _boom(**_):
            raise RuntimeError("engine threw")
        monkeypatch.setattr(runtime, "evaluate", _boom)
        results = {}
    elif fault == "backpressure":
        async def _shed(**_):
            raise BackpressureError("at capacity")
        monkeypatch.setattr(runtime, "evaluate", _shed)
        results = {}
    elif fault == "pool_exhaust":
        class PoolExhausted:
            async def get(self, url, params=None):
                return FakeResponse(404, {})
            async def post(self, url, json=None):
                raise RuntimeError("PoolTimeout: dedicated pool exhausted")
        monkeypatch.setattr(si, "get_shadow_client", lambda: PoolExhausted())
        results = {"safety_toxicity": pillar(95, 0.05)}
    else:  # malformed — junk objects in place of PillarResults
        class Ok:
            async def get(self, url, params=None):
                return FakeResponse(404, {})
            async def post(self, url, json=None):
                return FakeResponse(201)
        monkeypatch.setattr(si, "get_shadow_client", lambda: Ok())
        results = {"safety_toxicity": object(), "bias_fairness": SimpleNamespace()}

    # Must complete WITHOUT raising (the request already returned; nothing may escape).
    await si._shadow_evaluate(
        pillar_results=results,
        composite_score=0.5, tenant_id="t1", request_id=f"r-{fault}",
    )
    assert expected_outcome in outcomes


@pytest.mark.asyncio
async def test_hang_past_budget_is_severed_and_recorded_degraded():
    """A signal-collection hang must be severed at the budget and recorded degraded —
    the eval returns rather than hanging; the request (already returned) is untouched."""
    records = []
    res = await evaluate(
        policy=get_default_shadow_policy(),
        signal_collector=never,                 # never delivers — would hang forever
        expected_pillars=["safety_toxicity"],
        mode=EnforcementMode.SHADOW,
        budget_ms=30,                            # severed at 30ms
        signal_metadata={"composite_score": 0.9},
        audit_sink=records.append,
    )
    assert res.degradation["timeout_budget_exceeded"] is True
    assert "safety_toxicity" in res.degradation["missing_signals"]
    assert len(records) == 1                     # always recorded, even when severed


def test_kill_switch_flip_mid_stream_detaches_instantly(monkeypatch):
    """The ENV-DEFAULT gate path: with no runtime flag set, the env kill switch still
    gates dispatch at request time. NOTE (Phase-6 closeout): this is the static-default
    path only — env is frozen at container creation, so this alone is "detach via
    restart". The TRUE hot-detach proof (runtime flag, same process, no restart, drain,
    fail-safe) lives in tests/test_shadow_flags.py."""
    from fastapi import BackgroundTasks
    monkeypatch.setattr(si, "_shadow_evaluate", lambda **_: None)
    monkeypatch.setenv("ENGINE_SHADOW_SAMPLE_PCT", "100")

    # Attached:
    monkeypatch.setenv("ENGINE_SHADOW_ENABLED", "true")
    bt1 = BackgroundTasks()
    si.dispatch_shadow_eval(bt1, pillar_results={"safety_toxicity": pillar(95, 0.05)},
                            composite_score=0.9, tenant_id="t1", request_id="r1")
    assert len(bt1.tasks) == 1

    # Flip OFF mid-stream → next request is detached, no restart:
    monkeypatch.setenv("ENGINE_SHADOW_ENABLED", "false")
    bt2 = BackgroundTasks()
    si.dispatch_shadow_eval(bt2, pillar_results={"safety_toxicity": pillar(95, 0.05)},
                            composite_score=0.9, tenant_id="t1", request_id="r2")
    assert len(bt2.tasks) == 0
