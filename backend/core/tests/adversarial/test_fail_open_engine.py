"""Domain 3.3 — Fail-Open Hunting (engine layer)  [OWASP LLM06 Excessive Agency].

The cardinal guarantee: NO failure mode produces a silent `allow`, and a skipped
evaluation is never a pass (engine.py:274-306, :334-378; context.py:11-22).

This file attacks the PURE engine + context. The runtime (timeout/backpressure/
breaker/mode) is attacked in test_fail_open_runtime.py.

PASS = no silent fail-open (guarantee held). A FAIL would be a crown-jewel breach.
"""

from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from src.policy.context import SignalContext
from src.policy.engine import PolicyEngine
from src.policy.schema import (
    Action,
    EnforcementMode,
    FailMode,
    Policy,
    Rule,
    Severity,
)

NOW = datetime(2026, 1, 1, tzinfo=timezone.utc)


def _policy(rules, default=Action.ALLOW, pid="ff", version=1):
    return Policy(
        policy_id=pid, version=version, created_by="qa", created_at=NOW,
        effective_at=NOW, default_action=default, rules=tuple(rules),
    )


def _rule(rid, cond, action, sev, priority=0, fail_mode=None):
    return Rule(id=rid, condition=cond, description=rid, action=action,
                severity=sev, priority=priority, fail_mode=fail_mode)


def _engine():
    return PolicyEngine(audit_sink=lambda rec: None)


# A duck-typed PillarResult that context._interpret_result understands.
def _pillar(score=None, status="success", details=None):
    return SimpleNamespace(
        status=status,
        details=details or {},
        score=SimpleNamespace(value=score) if score is not None else None,
    )


# ── 1. Engine internal exception → fail CLOSED, never silent allow ─────────────

def test_engine_internal_exception_fails_closed_to_block(monkeypatch):
    engine = _engine()
    policy = _policy([_rule("r", "safety_score < 50", Action.BLOCK, Severity.HIGH)])

    import src.policy.engine as eng_mod
    monkeypatch.setattr(eng_mod, "resolve", lambda *_a, **_k: (_ for _ in ()).throw(RuntimeError("boom")))

    d = engine.simulate(policy, SignalContext(values={"safety_score": 99, "safety_evaluated": True}),
                        EnforcementMode.ENFORCE)
    assert d.engine_error is True
    assert d.decided_action == Action.BLOCK
    assert d.decided_severity == Severity.CRITICAL
    assert d.fail_mode_applied == FailMode.FAIL_CLOSED
    assert d.enforced is True  # gated even in enforce_critical_only (treated critical)


def test_engine_error_gates_under_enforce_critical_only():
    """engine_error is treated as CRITICAL, so even enforce_critical_only gates it."""
    engine = _engine()
    policy = _policy([_rule("r", "safety_score < 50", Action.BLOCK, Severity.HIGH)])
    # Force an error via a context the engine can't snapshot? Instead reuse monkeypatch-free
    # path: an undeclared field cannot reach here, so we rely on the prior test for the throw.
    # Here we assert the gating math directly for the critical engine-error action.
    from src.policy.engine import _compute_enforced
    assert _compute_enforced(Action.BLOCK, Severity.CRITICAL,
                             EnforcementMode.ENFORCE_CRITICAL_ONLY) is True


# ── 2. The score=92 demographic fast-path boundary ─────────────────────────────

def test_demographic_fast_path_suppresses_score_cannot_read_as_pass():
    """A bias pillar that hit the score=92 demographic fast-path did NOT assess bias.
    Its score must be suppressed to None and evaluated=False; a rule that treats a
    high score as 'safe' must ERROR (→ fail_mode), never see 92 as a pass."""
    ctx = SignalContext.from_pillar_results(
        {"bias_fairness": _pillar(score=92, status="success",
                                  details={"method": "demographic_fast_path"})}
    )
    assert ctx.values["bias_evaluated"] is False
    assert ctx.values["bias_score"] is None

    # A "high score == safe → allow" rule references the suppressed score → errors.
    # High severity ⇒ default fail_mode is FAIL_CLOSED ⇒ ESCALATE (worst-case).
    policy = _policy([_rule("safe_if_high", "bias_score >= 80", Action.ALLOW, Severity.HIGH)])
    d = _engine().simulate(policy, ctx, EnforcementMode.ENFORCE)
    assert d.decided_action == Action.ESCALATE
    assert d.fail_mode_applied == FailMode.FAIL_CLOSED
    assert d.decided_action != Action.ALLOW  # the 92 was NOT read as a pass


def test_skip_is_catchable_via_evaluated_flag():
    """The honest marker is observable: a rule on `bias_evaluated == false` fires and
    can escalate the skip rather than letting it slide."""
    ctx = SignalContext.from_pillar_results(
        {"bias_fairness": _pillar(score=92, details={"method": "demographic_fast_path"})}
    )
    policy = _policy([_rule("catch_skip", "bias_evaluated == False", Action.ESCALATE, Severity.HIGH)])
    d = _engine().simulate(policy, ctx, EnforcementMode.ENFORCE)
    assert d.winning_rule_id == "catch_skip"
    assert d.decided_action == Action.ESCALATE and d.enforced is True


# ── 3. Missing / partial signals never coerce to a pass ────────────────────────

def test_missing_critical_signal_fails_closed():
    ctx = SignalContext(values={"safety_score": 99, "safety_evaluated": True})  # no compliance
    policy = _policy([_rule("c", "compliance_score < 50", Action.BLOCK, Severity.CRITICAL)])
    d = _engine().simulate(policy, ctx, EnforcementMode.ENFORCE)
    assert d.decided_action == Action.BLOCK
    assert d.fail_mode_applied == FailMode.FAIL_CLOSED


def test_fail_open_rule_is_recorded_errored_never_silently_false():
    """A FAIL_OPEN rule whose signal is missing must be recorded as errored + non-firing
    — visible in the audit, not a silent False (engine.py:360-377)."""
    ctx = SignalContext(values={"safety_score": 99, "safety_evaluated": True})
    policy = _policy(
        [_rule("low", "bias_score < 40", Action.DISCLAIMER, Severity.LOW,
               fail_mode=FailMode.FAIL_OPEN)],
        default=Action.ALLOW,
    )
    d = _engine().simulate(policy, ctx, EnforcementMode.SHADOW)
    ev = [re for re in d.rule_evaluations if re.rule_id == "low"][0]
    assert ev.errored is True
    assert ev.fail_mode_applied == FailMode.FAIL_OPEN
    assert ev.matched is False  # did not fire, but recorded WHY


def test_partial_signals_do_not_fabricate_missing_pillar():
    """A degraded/partial pillar result yields evaluated=False and a None score —
    not a fabricated passing value (context.py:166-197)."""
    ctx = SignalContext.from_pillar_results(
        {"safety_toxicity": _pillar(score=95, status="partial")}
    )
    assert ctx.values["safety_evaluated"] is False
    assert ctx.values["safety_score"] is None


# ── 4. NaN / Inf score probe (fail-open vector) ────────────────────────────────

def test_nan_score_evades_threshold_rule_DEFEAT_partial():
    """[HELD — Finding F-FAILOPEN-NAN-1 fixed | OWASP LLM06]

    A non-finite score is now normalized at SignalContext construction
    (context.py): NaN on a pillar score/risk is treated as a MISSING signal
    (value → None, *_evaluated → False), so the natural threshold rule
    `bias_score < 40` no longer reads `NaN < 40` as a quiet False. The rule
    references a missing signal → MissingSignalError → its fail_mode. A CRITICAL
    rule defaults to FAIL_CLOSED → BLOCK. The fail-open is closed.

    (Test name kept for report-traceability; the assertion flipped DEFEAT→HELD —
    the behavior changed, the attack is unchanged.)
    """
    nan = float("nan")
    ctx = SignalContext(values={"bias_score": nan, "bias_risk": nan, "bias_evaluated": True})

    # The non-finite score is suppressed; the decision record shows evaluated:false.
    assert ctx.values["bias_score"] is None
    assert ctx.values["bias_evaluated"] is False

    # Natural "catch low scores" rule — now FAILS CLOSED instead of silently allowing.
    permissive = _policy(
        [_rule("catch_low", "bias_score < 40", Action.BLOCK, Severity.CRITICAL)],
        default=Action.ALLOW,
    )
    d = _engine().simulate(permissive, ctx, EnforcementMode.ENFORCE)
    assert d.decided_action == Action.BLOCK   # <-- fail-closed: NaN no longer slips the rule
    assert d.enforced is True
    assert d.fail_mode_applied == FailMode.FAIL_CLOSED
    assert d.signal_snapshot["bias_evaluated"] is False  # the offending signal recorded as un-evaluated

    # Defensive phrasing also fails closed (the signal is missing either way).
    defensive = _policy(
        [_rule("catch_low", "not (bias_score >= 40)", Action.BLOCK, Severity.CRITICAL)],
        default=Action.ALLOW, pid="ff_def",
    )
    d2 = _engine().simulate(defensive, ctx, EnforcementMode.ENFORCE)
    assert d2.decided_action == Action.BLOCK


def test_inf_score_behaviour_is_recorded():
    """±Inf score: likewise normalized to missing (None) + evaluated:false at context
    construction. A `bias_score > 40` HIGH rule now errors → FAIL_CLOSED → ESCALATE
    (not because Inf > 40, but because the non-finite signal is suppressed). The
    snapshot records the suppression, never the raw non-finite value."""
    inf = float("inf")
    ctx = SignalContext(values={"bias_score": inf, "bias_evaluated": True})
    assert ctx.values["bias_score"] is None
    policy = _policy([_rule("hi", "bias_score > 40", Action.ESCALATE, Severity.HIGH)])
    d = _engine().simulate(policy, ctx, EnforcementMode.ENFORCE)
    assert d.decided_action == Action.ESCALATE
    assert d.fail_mode_applied == FailMode.FAIL_CLOSED
    assert d.signal_snapshot["bias_score"] is None
    assert d.signal_snapshot["bias_evaluated"] is False


# ── 5. No-match default is the DECLARED action, not implicit allow ─────────────

def test_no_match_uses_declared_block_default():
    policy = _policy([_rule("r", "safety_score < 10", Action.BLOCK, Severity.HIGH)],
                     default=Action.BLOCK)
    d = _engine().simulate(policy, SignalContext(values={"safety_score": 99, "safety_evaluated": True}),
                           EnforcementMode.ENFORCE)
    assert d.decided_action == Action.BLOCK and d.decided_by == "default_action"
