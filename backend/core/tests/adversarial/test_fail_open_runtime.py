"""Domain 3.3 — Fail-Open Hunting (runtime host layer)  [OWASP LLM06 / LLM10].

Attacks the operational envelope (runtime.py) and the mode resolver (mode_client.py)
that the authors' test_policy_runtime.py also touches — but with harder, adversarial
variants: the breaker introspection RAISES, the mode lookup returns hostile/malformed
bodies, the audit sink raises mid-flight, the collector explodes, and backpressure
sheds under contention. In every case the question is the same: does ANY path return
a silent `allow` or fail to gate a critical decision?

PASS = no silent fail-open. No production code modified.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from src.policy import Action, EnforcementMode, FailMode, Policy, Rule, Severity
from src.policy import runtime
from src.policy.runtime import BackpressureError, evaluate

_NOW = datetime(2026, 1, 1, tzinfo=timezone.utc)


def _crit_block_with_allow_default() -> Policy:
    """A critical fail-closed rule on bias_score; default ALLOW is the trap."""
    return Policy(
        policy_id="adv_runtime", version=1, created_by="qa", created_at=_NOW,
        effective_at=_NOW, default_action=Action.ALLOW,
        rules=(Rule("crit", "bias_score < 40", "block biased", Action.BLOCK,
                    Severity.CRITICAL, fail_mode=FailMode.FAIL_CLOSED),),
    )


class _Sink:
    def __init__(self):
        self.records = []

    def __call__(self, rec):
        self.records.append(rec)


async def _hang(partial):
    await asyncio.sleep(10)


async def _explode(partial):
    raise RuntimeError("all provider tiers exhausted (NIM→Groq→Bedrock→OSS)")


def _fills(results):
    async def _c(partial):
        partial.update(results)
    return _c


@pytest.fixture(autouse=True)
def _hermetic(monkeypatch):
    async def _closed():
        return {}
    monkeypatch.setattr("src.inference.circuit_breaker.async_get_all_states", _closed)
    runtime.configure(max_concurrent=64)
    yield
    runtime.configure(max_concurrent=64)


# ── 1. Breaker introspection RAISES → decision still fails closed ──────────────

@pytest.mark.asyncio
async def test_breaker_introspection_raising_does_not_cause_allow(monkeypatch):
    async def _boom():
        raise ConnectionError("redis down")
    monkeypatch.setattr("src.inference.circuit_breaker.async_get_all_states", _boom)

    sink = _Sink()
    res = await evaluate(
        policy=_crit_block_with_allow_default(),
        signal_collector=_hang,                  # bias never arrives
        expected_pillars=["bias_fairness"],
        mode=EnforcementMode.ENFORCE,
        budget_ms=20,
        audit_sink=sink,
    )
    # Breaker read failure must NOT break the decision, and missing critical → BLOCK.
    assert res.decision.decided_action == Action.BLOCK
    assert res.decision.enforced is True
    assert len(sink.records) == 1


# ── 2. Signal collector explodes (all tiers exhausted) → fail closed ───────────

@pytest.mark.asyncio
async def test_collector_exception_fails_closed_not_open():
    sink = _Sink()
    res = await evaluate(
        policy=_crit_block_with_allow_default(),
        signal_collector=_explode,
        expected_pillars=["bias_fairness"],
        mode=EnforcementMode.ENFORCE,
        budget_ms=50,
        audit_sink=sink,
    )
    assert res.degradation["signal_collection_error"] is not None
    assert res.decision.decided_action == Action.BLOCK   # not the default ALLOW
    assert res.decision.fail_mode_applied == FailMode.FAIL_CLOSED


# ── 3. Audit sink raises mid-flight → no crash, no coercion to allow ───────────

@pytest.mark.asyncio
async def test_audit_sink_raising_does_not_break_or_open_decision():
    def _bad_sink(_rec):
        raise IOError("connectors unreachable")

    res = await evaluate(
        policy=_crit_block_with_allow_default(),
        signal_collector=_hang,
        expected_pillars=["bias_fairness"],
        mode=EnforcementMode.ENFORCE,
        budget_ms=20,
        audit_sink=_bad_sink,                     # raises inside the runtime
    )
    # The decision is returned intact; the sink failure is swallowed (runtime.py:252-255).
    assert res.decision.decided_action == Action.BLOCK
    assert res.decision.enforced is True


# ── 4. Backpressure sheds (503-class) — it does NOT silently allow ─────────────

@pytest.mark.asyncio
async def test_backpressure_sheds_rather_than_allowing():
    runtime.configure(max_concurrent=1)
    try:
        # Occupy the single slot with a long-running evaluation.
        slow = asyncio.create_task(evaluate(
            policy=_crit_block_with_allow_default(),
            signal_collector=_hang,
            expected_pillars=["bias_fairness"],
            mode=EnforcementMode.SHADOW,
            budget_ms=400,
            audit_sink=_Sink(),
        ))
        await asyncio.sleep(0.02)  # let it acquire the slot

        # Second eval cannot get the slot within the wait window → must SHED, not allow.
        with pytest.raises(BackpressureError):
            await evaluate(
                policy=_crit_block_with_allow_default(),
                signal_collector=_fills({"bias_fairness": SimpleNamespace(
                    status=SimpleNamespace(value="success"),
                    score=SimpleNamespace(value=10.0),
                    details={"method": "nim_api"}, flags=[])}),
                expected_pillars=["bias_fairness"],
                mode=EnforcementMode.ENFORCE,
                budget_ms=50,
                backpressure_wait_ms=5,
                audit_sink=_Sink(),
            )
        slow.cancel()
        try:
            await slow
        except (asyncio.CancelledError, Exception):
            pass
    finally:
        runtime.configure(max_concurrent=64)


# ── 5. Exactly one audit record per evaluation (no double / no zero) ───────────

@pytest.mark.asyncio
async def test_exactly_one_audit_record_even_on_degradation():
    sink = _Sink()
    await evaluate(
        policy=_crit_block_with_allow_default(),
        signal_collector=_explode,
        expected_pillars=["bias_fairness"],
        mode=EnforcementMode.ENFORCE,
        budget_ms=30,
        audit_sink=sink,
    )
    assert len(sink.records) == 1
    rec = sink.records[0]
    assert rec["actuated"] is False                 # honesty marker carried forward
    assert rec["decided_action"] == "block"
    assert "degradation" in rec


# ═══════════════════════════════════════════════════════════════════════════════
#  mode_client fail-safe: a lookup can only ever DE-gate (→ shadow), never enforce
# ═══════════════════════════════════════════════════════════════════════════════

def _fake_client(resp=None, exc=None):
    class _C:
        async def get(self, *_a, **_k):
            if exc is not None:
                raise exc
            return resp
    return _C()


def _resp(status, body):
    return SimpleNamespace(status_code=status, json=lambda: body)


@pytest.mark.asyncio
async def test_mode_lookup_failure_falls_back_to_shadow(monkeypatch):
    from src.policy import mode_client
    mode_client.invalidate()
    monkeypatch.setattr("src.core.http_pool.get_internal_client",
                        lambda: _fake_client(exc=ConnectionError("connectors down")))
    mode = await mode_client.get_mode("tenant-x", "pol")
    assert mode == EnforcementMode.SHADOW


@pytest.mark.asyncio
async def test_mode_lookup_unknown_string_coerces_to_shadow(monkeypatch):
    from src.policy import mode_client
    mode_client.invalidate()
    # A hostile/garbled body must never escalate to enforce.
    for hostile in ["ENFORCE", "enforce ", "еnforce", "yolo", None, 42, "enforce_all"]:
        mode_client.invalidate()
        monkeypatch.setattr("src.core.http_pool.get_internal_client",
                            lambda b=hostile: _fake_client(_resp(200, {"mode": b})))
        mode = await mode_client.get_mode("t", "pol")
        assert mode == EnforcementMode.SHADOW, f"hostile mode {hostile!r} escalated!"


@pytest.mark.asyncio
async def test_mode_lookup_404_is_shadow(monkeypatch):
    from src.policy import mode_client
    mode_client.invalidate()
    monkeypatch.setattr("src.core.http_pool.get_internal_client",
                        lambda: _fake_client(_resp(404, {})))
    assert await mode_client.get_mode("t", "pol") == EnforcementMode.SHADOW


@pytest.mark.asyncio
async def test_mode_lookup_valid_enforce_is_honored(monkeypatch):
    """Control: a well-formed enforce IS honored (so the fail-safe isn't just 'always
    shadow', which would make the safety property vacuous)."""
    from src.policy import mode_client
    mode_client.invalidate()
    monkeypatch.setattr("src.core.http_pool.get_internal_client",
                        lambda: _fake_client(_resp(200, {"mode": "enforce"})))
    assert await mode_client.get_mode("t", "pol") == EnforcementMode.ENFORCE
    mode_client.invalidate()
