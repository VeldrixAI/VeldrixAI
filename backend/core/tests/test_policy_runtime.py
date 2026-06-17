"""Policy Engine *runtime host* — safe-fallback / degradation tests (Part B / B.1).

Covers the §5 Part-B checklist items for graceful degradation:
  * per-evaluation timeout budget → missing signals marked evaluated:false + fail-closed,
  * provider-tier breaker state recorded in the decision record (no silent missing signal),
  * backpressure: bounded shedding under overload (never an unbounded queue),
  * adversarial sweep: no degradation path ever yields a silent ``allow``,
  * exactly ONE augmented audit record (degradation block + actuated:false honesty marker).

Pure: no network, no LLM. The breaker state and audit sink are injected/monkeypatched.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from src.policy import (
    Action,
    EnforcementMode,
    FailMode,
    Policy,
    Rule,
    Severity,
)
from src.policy import runtime
from src.policy.runtime import BackpressureError, evaluate

_NOW = datetime(2026, 6, 16, 12, 0, 0, tzinfo=timezone.utc)


# ── helpers ───────────────────────────────────────────────────────────────────

def make_policy(*rules: Rule, default_action: Action = Action.ALLOW) -> Policy:
    return Policy(
        policy_id="pol_runtime",
        version=1,
        created_by="tester",
        created_at=_NOW,
        effective_at=_NOW,
        default_action=default_action,
        rules=tuple(rules),
    )


def crit_block_policy() -> Policy:
    """A fail-closed critical rule on bias_score — missing bias must BLOCK, never ALLOW."""
    return make_policy(
        Rule("r_crit", "bias_score < 40", "block biased output", Action.BLOCK,
             Severity.CRITICAL, fail_mode=FailMode.FAIL_CLOSED),
        default_action=Action.ALLOW,  # the trap: a silent pass if fail-closed didn't fire
    )


def real_bias_result(score: float, risk: float):
    return SimpleNamespace(
        status=SimpleNamespace(value="success"),
        score=SimpleNamespace(value=score),
        details={"method": "nim_api", "nim_risk_score": risk},
        flags=[],
    )


class RecordingSink:
    def __init__(self):
        self.records = []

    def __call__(self, record):
        self.records.append(record)


def fills(results):
    async def _c(partial):
        partial.update(results)
    return _c


def fills_then_hang(results):
    async def _c(partial):
        partial.update(results)
        await asyncio.sleep(10)
    return _c


async def never(partial):
    await asyncio.sleep(10)


async def raises(partial):
    raise ValueError("provider chain exhausted")


@pytest.fixture(autouse=True)
def _reset_runtime(monkeypatch):
    """Hermetic breaker state + a roomy concurrency gate for non-backpressure tests."""
    async def _all_closed():
        return {}
    monkeypatch.setattr("src.inference.circuit_breaker.async_get_all_states", _all_closed)
    runtime.configure(max_concurrent=64)
    yield
    runtime.configure(max_concurrent=64)


# ═══════════════════════════════════════════════════════════════════════════════
#  timeout budget
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_timeout_marks_missing_and_fails_closed():
    sink = RecordingSink()
    res = await evaluate(
        policy=crit_block_policy(),
        signal_collector=never,                 # never delivers bias
        expected_pillars=["bias_fairness"],
        mode=EnforcementMode.ENFORCE,
        budget_ms=30,
        audit_sink=sink,
    )
    assert res.degradation["timeout_budget_exceeded"] is True
    assert "bias_fairness" in res.degradation["missing_signals"]
    # Missing critical signal must fail closed — never the default ALLOW.
    assert res.decision.decided_action == Action.BLOCK
    assert res.decision.fail_mode_applied == FailMode.FAIL_CLOSED
    assert res.decision.enforced is True
    assert len(sink.records) == 1


@pytest.mark.asyncio
async def test_partial_signals_survive_timeout():
    """A pillar that arrived before the deadline is kept; only the laggard is missing."""
    sink = RecordingSink()
    res = await evaluate(
        policy=make_policy(default_action=Action.ALLOW),
        signal_collector=fills_then_hang({"safety_toxicity": real_bias_result(95.0, 0.05)}),
        expected_pillars=["safety_toxicity", "bias_fairness"],
        mode=EnforcementMode.SHADOW,
        budget_ms=30,
        audit_sink=sink,
    )
    assert res.degradation["timeout_budget_exceeded"] is True
    assert res.degradation["missing_signals"] == ["bias_fairness"]
    assert res.decision.signal_snapshot["safety_evaluated"] is True
    assert res.decision.signal_snapshot["bias_evaluated"] is False


# ═══════════════════════════════════════════════════════════════════════════════
#  circuit-breaker awareness (consume, never reimplement)
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_breaker_degraded_tier_recorded(monkeypatch):
    async def _states():
        return {"nvidia_nim": "OPEN", "groq": "HALF_OPEN", "bedrock": "CLOSED"}
    monkeypatch.setattr("src.inference.circuit_breaker.async_get_all_states", _states)

    sink = RecordingSink()
    res = await evaluate(
        policy=make_policy(default_action=Action.ALLOW),
        signal_collector=fills({"bias_fairness": real_bias_result(90.0, 0.1)}),
        expected_pillars=["bias_fairness"],
        mode=EnforcementMode.SHADOW,
        audit_sink=sink,
    )
    deg = res.degradation
    assert deg["provider_fallback_fired"] is True
    assert set(deg["degraded_provider_tiers"]) == {"nvidia_nim", "groq"}
    assert deg["provider_breaker_states"]["bedrock"] == "CLOSED"
    # The degraded posture is chain-protected: it rides inside the audit record.
    assert sink.records[0]["degradation"]["degraded_provider_tiers"]


# ═══════════════════════════════════════════════════════════════════════════════
#  exactly one augmented record + honesty markers
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_emits_single_record_with_degradation_and_actuated():
    sink = RecordingSink()
    await evaluate(
        policy=make_policy(default_action=Action.ALLOW),
        signal_collector=fills({"bias_fairness": real_bias_result(90.0, 0.1)}),
        mode=EnforcementMode.SHADOW,
        audit_sink=sink,
    )
    assert len(sink.records) == 1
    rec = sink.records[0]
    assert rec["actuated"] is False               # carried-forward honesty marker
    assert "degradation" in rec
    assert rec["mode"] == "shadow"
    assert rec["enforced"] is False               # shadow records but never gates


@pytest.mark.asyncio
async def test_shadow_records_but_does_not_gate():
    sink = RecordingSink()
    res = await evaluate(
        policy=crit_block_policy(),
        signal_collector=fills({"bias_fairness": real_bias_result(10.0, 0.9)}),  # would block
        mode=EnforcementMode.SHADOW,
        audit_sink=sink,
    )
    assert res.decision.decided_action == Action.BLOCK   # decision still reached
    assert res.decision.enforced is False                # but shadow gates nothing
    assert len(sink.records) == 1


# ═══════════════════════════════════════════════════════════════════════════════
#  mode resolution is consulted when not supplied (fail-safe path)
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_mode_resolved_via_mode_client_when_unset(monkeypatch):
    seen = {}

    async def _fake_get_mode(tenant_id, policy_id):
        seen["tenant"] = tenant_id
        seen["policy"] = policy_id
        return EnforcementMode.ENFORCE

    monkeypatch.setattr("src.policy.mode_client.get_mode", _fake_get_mode)
    res = await evaluate(
        policy=crit_block_policy(),
        signal_collector=fills({"bias_fairness": real_bias_result(10.0, 0.9)}),
        tenant_id="tenant-123",
        mode=None,                                  # force a lookup
        audit_sink=RecordingSink(),
    )
    assert seen == {"tenant": "tenant-123", "policy": "pol_runtime"}
    assert res.mode == EnforcementMode.ENFORCE
    assert res.decision.enforced is True


# ═══════════════════════════════════════════════════════════════════════════════
#  backpressure — bounded shedding, never an unbounded queue
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_backpressure_sheds_under_overload():
    runtime.configure(max_concurrent=2)
    try:
        async def _one():
            return await evaluate(
                policy=make_policy(default_action=Action.ALLOW),
                signal_collector=fills_then_hang({"bias_fairness": real_bias_result(90.0, 0.1)}),
                mode=EnforcementMode.SHADOW,
                budget_ms=300,            # holders sit in collect for the full budget
                backpressure_wait_ms=20,  # excess sheds quickly rather than queueing
                audit_sink=RecordingSink(),
            )

        results = await asyncio.gather(*[_one() for _ in range(10)], return_exceptions=True)
        shed = [r for r in results if isinstance(r, BackpressureError)]
        ok = [r for r in results if not isinstance(r, Exception)]
        # With a gate of 2 and 10 simultaneous calls, the surplus must shed — bounded.
        assert len(shed) >= 6
        assert len(ok) <= 2
        assert len(shed) + len(ok) == 10  # nothing lost, nothing queued unboundedly
    finally:
        runtime.configure(max_concurrent=64)


# ═══════════════════════════════════════════════════════════════════════════════
#  adversarial sweep — NO degradation path yields a silent allow
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
@pytest.mark.parametrize("collector", [never, raises, fills({})], ids=["timeout", "exception", "empty"])
async def test_no_silent_allow_across_failure_modes(monkeypatch, collector):
    # Provider chain also degraded, to stack the worst case.
    async def _states():
        return {"nvidia_nim": "OPEN"}
    monkeypatch.setattr("src.inference.circuit_breaker.async_get_all_states", _states)

    sink = RecordingSink()
    res = await evaluate(
        policy=crit_block_policy(),
        signal_collector=collector,
        expected_pillars=["bias_fairness"],
        mode=EnforcementMode.ENFORCE,
        budget_ms=30,
        audit_sink=sink,
    )
    assert res.decision.decided_action != Action.ALLOW   # never a silent pass
    assert res.decision.decided_action == Action.BLOCK    # fail-closed critical
    assert res.decision.enforced is True
    assert len(sink.records) == 1                          # always recorded
    assert res.degradation["provider_fallback_fired"] is True
