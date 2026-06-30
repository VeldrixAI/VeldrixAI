"""Phase-6 shadow integration — unit-level isolation, zero-actuation, controls.

These prove the safety core of the out-of-band shadow connection on the core
``/trust/evaluate`` path, WITHOUT a live stack:

  * dispatch is post-response (only enqueues; the worker does not run during dispatch),
  * the dispatch hand-off adds ~0 latency (impact guard),
  * the kill switch + sample gate are honored at request time,
  * every record is forced ``enforced:false`` / ``actuated:false`` / ``integration:shadow``
    even when the resolved mode is ``enforce`` and the decided action is ``block``,
  * the worker uses the DEDICATED pool and never the shared request-path HTTP pool,
  * the worker swallows every fault (no exception can reach the request).

Pure: no network. The dedicated client + audit write are injected/monkeypatched.
"""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest
from fastapi import BackgroundTasks

from src.policy import runtime, shadow_integration as si
from src.policy.runtime import BackpressureError
from src.policy.schema import EnforcementMode
from src.telemetry import policy_metrics as metrics


# ── helpers ─────────────────────────────────────────────────────────────────────

def pillar(score, risk, status="success", method="nim_api"):
    """A duck-typed stand-in for a core PillarResult (matches context._interpret_result)."""
    return SimpleNamespace(
        status=SimpleNamespace(value=status),
        score=SimpleNamespace(value=score, confidence=0.9, risk_level=None),
        details={"method": method, "nim_risk_score": risk},
        flags=[],
        execution_time_ms=12.0,
        error=None,
    )


class FakeResponse:
    def __init__(self, status_code=201, json_body=None, text=""):
        self.status_code = status_code
        self._json = json_body or {}
        self.text = text

    def json(self):
        return self._json


class FakeShadowClient:
    """Captures dedicated-pool calls. .get → mode lookup, .post → audit write."""

    def __init__(self, mode_status=404, mode_value=None, post_status=201):
        self.mode_status = mode_status
        self.mode_value = mode_value
        self.post_status = post_status
        self.posts = []
        self.gets = []

    async def get(self, url, params=None):
        self.gets.append((url, params))
        return FakeResponse(self.mode_status, {"mode": self.mode_value})

    async def post(self, url, json=None):
        self.posts.append((url, json))
        return FakeResponse(self.post_status)


@pytest.fixture(autouse=True)
def _reset(monkeypatch):
    """Hermetic breaker state, roomy gate, clean mode cache, captured metric helpers."""
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
    """Capture shadow outcome counters into a list instead of prometheus globals."""
    seen = []
    monkeypatch.setattr(metrics, "record_shadow_outcome", lambda o: seen.append(o))
    return seen


@pytest.fixture
def handoffs(monkeypatch):
    seen = []
    monkeypatch.setattr(metrics, "observe_shadow_handoff", lambda s: seen.append(s))
    return seen


# ═══════════════════════════════════════════════════════════════════════════════
#  Controls: kill switch + sample gate (read at request time)
# ═══════════════════════════════════════════════════════════════════════════════

def test_kill_switch_off_does_not_dispatch(monkeypatch, outcomes, handoffs):
    monkeypatch.delenv("ENGINE_SHADOW_ENABLED", raising=False)
    bt = BackgroundTasks()
    si.dispatch_shadow_eval(
        bt, pillar_results={"safety_toxicity": pillar(95, 0.05)},
        composite_score=0.9, tenant_id="t1", request_id="r1",
    )
    assert len(bt.tasks) == 0
    assert outcomes == ["skipped_kill_switch"]
    assert len(handoffs) == 1  # impact guard is measured even on the skip path


def test_sample_zero_does_not_dispatch(monkeypatch, outcomes):
    monkeypatch.setenv("ENGINE_SHADOW_ENABLED", "true")
    monkeypatch.setenv("ENGINE_SHADOW_SAMPLE_PCT", "0")
    bt = BackgroundTasks()
    si.dispatch_shadow_eval(
        bt, pillar_results={"safety_toxicity": pillar(95, 0.05)},
        composite_score=0.9, tenant_id="t1", request_id="r1",
    )
    assert len(bt.tasks) == 0
    assert outcomes == ["skipped_unsampled"]


def test_enabled_full_sample_dispatches_but_does_not_run(monkeypatch, outcomes):
    monkeypatch.setenv("ENGINE_SHADOW_ENABLED", "true")
    monkeypatch.setenv("ENGINE_SHADOW_SAMPLE_PCT", "100")
    ran = {"worker": False}

    async def _spy(**_):
        ran["worker"] = True
    monkeypatch.setattr(si, "_shadow_evaluate", _spy)

    bt = BackgroundTasks()
    si.dispatch_shadow_eval(
        bt, pillar_results={"safety_toxicity": pillar(95, 0.05)},
        composite_score=0.9, tenant_id="t1", request_id="r1",
    )
    # Dispatched: the task is QUEUED but has NOT executed (proves post-response timing).
    assert len(bt.tasks) == 1
    assert ran["worker"] is False
    assert outcomes == ["dispatched"]


def test_first_run_posture_is_zero_percent(monkeypatch):
    """With no env set, the engine is attached to 0% of traffic (deliberate turn-on)."""
    monkeypatch.delenv("ENGINE_SHADOW_ENABLED", raising=False)
    monkeypatch.delenv("ENGINE_SHADOW_SAMPLE_PCT", raising=False)
    assert si.shadow_enabled() is False
    assert si.sample_pct() == 0.0


def test_sample_pct_is_clamped(monkeypatch):
    monkeypatch.setenv("ENGINE_SHADOW_SAMPLE_PCT", "250")
    assert si.sample_pct() == 100.0
    monkeypatch.setenv("ENGINE_SHADOW_SAMPLE_PCT", "-5")
    assert si.sample_pct() == 0.0
    monkeypatch.setenv("ENGINE_SHADOW_SAMPLE_PCT", "garbage")
    assert si.sample_pct() == 0.0


def test_dispatch_handoff_is_tiny(monkeypatch, handoffs):
    """The impact guard: the request-path hand-off must add ~0 latency."""
    monkeypatch.setenv("ENGINE_SHADOW_ENABLED", "true")
    monkeypatch.setenv("ENGINE_SHADOW_SAMPLE_PCT", "100")
    monkeypatch.setattr(si, "_shadow_evaluate", lambda **_: None)
    bt = BackgroundTasks()
    si.dispatch_shadow_eval(
        bt, pillar_results={"safety_toxicity": pillar(95, 0.05)},
        composite_score=0.9, tenant_id="t1", request_id="r1",
    )
    assert handoffs and handoffs[0] < 0.01  # < 10ms — generous; in practice microseconds


def test_dispatch_never_raises_into_request(monkeypatch, outcomes):
    """Even if add_task blows up, dispatch must swallow and the handler is unaffected."""
    monkeypatch.setenv("ENGINE_SHADOW_ENABLED", "true")
    monkeypatch.setenv("ENGINE_SHADOW_SAMPLE_PCT", "100")

    class BoomBT:
        def add_task(self, *a, **k):
            raise RuntimeError("queue full")

    # Must not raise:
    si.dispatch_shadow_eval(
        BoomBT(), pillar_results={"safety_toxicity": pillar(95, 0.05)},
        composite_score=0.9, tenant_id="t1", request_id="r1",
    )
    assert "dropped_dispatch" in outcomes


# ═══════════════════════════════════════════════════════════════════════════════
#  Zero actuation — enforced:false / actuated:false / integration:shadow, always
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_record_forced_non_enforcing_even_under_enforce(monkeypatch):
    """Resolved mode is recorded honestly, but enforced is structurally forced false."""
    client = FakeShadowClient()
    monkeypatch.setattr(si, "get_shadow_client", lambda: client)
    # Force the resolved mode to ENFORCE and feed signals that decide BLOCK.
    monkeypatch.setattr(si, "_resolve_mode", _const_mode(EnforcementMode.ENFORCE))

    await si._shadow_evaluate(
        pillar_results={"prompt_security": pillar(5, 0.95)},
        composite_score=0.2, tenant_id="t1", request_id="r-block",
    )

    assert len(client.posts) == 1
    _, body = client.posts[0]
    rec = body["metadata"]
    assert body["action_type"] == "policy_decision_shadow"
    assert rec["decided_action"] == "block"     # the engine WOULD block
    assert rec["mode"] == "enforce"              # recorded honestly
    assert rec["enforced"] is False              # but never enforced (structural)
    assert rec["actuated"] is False
    assert rec["integration"] == "shadow"


@pytest.mark.asyncio
async def test_shadow_marker_present_on_allow(monkeypatch):
    client = FakeShadowClient()
    monkeypatch.setattr(si, "get_shadow_client", lambda: client)
    monkeypatch.setattr(si, "_resolve_mode", _const_mode(EnforcementMode.SHADOW))
    await si._shadow_evaluate(
        pillar_results={"safety_toxicity": pillar(98, 0.01)},
        composite_score=0.95, tenant_id="t1", request_id="r-allow",
    )
    rec = client.posts[0][1]["metadata"]
    assert rec["decided_action"] == "allow"
    assert rec["enforced"] is False
    assert rec["integration"] == "shadow"


def _const_mode(mode):
    async def _f(_tenant, _policy):
        return mode
    return _f


# ═══════════════════════════════════════════════════════════════════════════════
#  Dedicated-pool isolation — the worker NEVER touches the shared request pool
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_worker_never_uses_shared_internal_pool(monkeypatch, outcomes):
    client = FakeShadowClient(mode_status=404)  # mode → shadow
    monkeypatch.setattr(si, "get_shadow_client", lambda: client)

    def _boom():
        raise AssertionError("worker used the SHARED request-path pool — isolation broken")
    monkeypatch.setattr("src.core.http_pool.get_internal_client", _boom)

    await si._shadow_evaluate(
        pillar_results={"safety_toxicity": pillar(95, 0.05)},
        composite_score=0.9, tenant_id="t1", request_id="r-iso",
    )
    # Mode read AND audit write both went through the dedicated client:
    assert len(client.gets) == 1
    assert len(client.posts) == 1
    assert "written" in outcomes


def test_dedicated_pool_is_distinct_object():
    from src.core.http_pool import get_internal_client
    from src.policy.shadow_pool import get_shadow_client
    assert get_shadow_client() is not get_internal_client()


# ═══════════════════════════════════════════════════════════════════════════════
#  Total worker isolation — every fault is swallowed + counted
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_engine_exception_is_swallowed(monkeypatch, outcomes):
    async def _boom(**_):
        raise RuntimeError("engine exploded")
    monkeypatch.setattr(runtime, "evaluate", _boom)
    monkeypatch.setattr(si, "_resolve_mode", _const_mode(EnforcementMode.SHADOW))
    # Must NOT raise:
    await si._shadow_evaluate(
        pillar_results={"safety_toxicity": pillar(95, 0.05)},
        composite_score=0.9, tenant_id="t1", request_id="r-exc",
    )
    assert "worker_exception" in outcomes


@pytest.mark.asyncio
async def test_backpressure_is_counted_not_raised(monkeypatch, outcomes):
    async def _shed(**_):
        raise BackpressureError("at capacity")
    monkeypatch.setattr(runtime, "evaluate", _shed)
    monkeypatch.setattr(si, "_resolve_mode", _const_mode(EnforcementMode.SHADOW))
    await si._shadow_evaluate(
        pillar_results={"safety_toxicity": pillar(95, 0.05)},
        composite_score=0.9, tenant_id="t1", request_id="r-bp",
    )
    assert "dropped_backpressure" in outcomes
    assert "worker_exception" not in outcomes


@pytest.mark.asyncio
async def test_write_failure_is_counted(monkeypatch, outcomes):
    class FailingClient(FakeShadowClient):
        async def post(self, url, json=None):
            raise RuntimeError("dedicated pool exhausted (PoolTimeout)")
    client = FailingClient()
    monkeypatch.setattr(si, "get_shadow_client", lambda: client)
    monkeypatch.setattr(si, "_resolve_mode", _const_mode(EnforcementMode.SHADOW))
    await si._shadow_evaluate(
        pillar_results={"safety_toxicity": pillar(95, 0.05)},
        composite_score=0.9, tenant_id="t1", request_id="r-wf",
    )
    assert "write_failed" in outcomes


@pytest.mark.asyncio
async def test_malformed_pillar_results_do_not_crash_worker(monkeypatch, outcomes):
    """Malformed/partial signals must degrade to a record, never raise."""
    client = FakeShadowClient()
    monkeypatch.setattr(si, "get_shadow_client", lambda: client)
    monkeypatch.setattr(si, "_resolve_mode", _const_mode(EnforcementMode.SHADOW))
    # A junk object with none of the PillarResult attributes:
    await si._shadow_evaluate(
        pillar_results={"safety_toxicity": object(), "bias_fairness": SimpleNamespace()},
        composite_score=0.5, tenant_id="t1", request_id="r-bad",
    )
    assert "written" in outcomes
    assert "worker_exception" not in outcomes
    rec = client.posts[0][1]["metadata"]
    # The malformed pillars must read as NOT evaluated (never a fabricated pass).
    assert rec["signal_snapshot"]["safety_evaluated"] is False


@pytest.mark.asyncio
async def test_mode_lookup_failure_falls_back_to_shadow(monkeypatch, outcomes):
    class GetBoom(FakeShadowClient):
        async def get(self, url, params=None):
            raise RuntimeError("connectors unreachable")
    client = GetBoom()
    monkeypatch.setattr(si, "get_shadow_client", lambda: client)
    await si._shadow_evaluate(
        pillar_results={"prompt_security": pillar(5, 0.95)},
        composite_score=0.2, tenant_id="t1", request_id="r-modefail",
    )
    rec = client.posts[0][1]["metadata"]
    assert rec["mode"] == "shadow"     # fail-safe — a lookup error can only de-gate
    assert rec["enforced"] is False
