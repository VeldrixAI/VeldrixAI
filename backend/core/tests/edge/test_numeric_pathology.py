"""Edge battery — numeric pathology beyond NaN/Inf (engine robustness).

Targets the numeric-comparison surface that the Phase-3 pass touched only via NaN/Inf:
subnormals, signed zero, exact float boundaries, overflow-to-inf, magnitude extremes,
int/float coercion, and string-vs-number confusion. Built against the REAL engine.

Where a class is handled safely, the test asserts HELD. Where current behavior is a
robustness gap (not a fail-open, requires an upstream type defect), it asserts the
ACTUAL behavior and points at EDGE_FINDINGS.md (report-only — nothing is fixed here).
"""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from src.policy.context import SignalContext
from src.policy.engine import PolicyEngine
from src.policy.schema import Action, EnforcementMode, FailMode, Policy, Rule, Severity

NOW = datetime(2026, 1, 1, tzinfo=timezone.utc)


def _policy(rules, default=Action.ALLOW, pid="num"):
    return Policy(policy_id=pid, version=1, created_by="qa", created_at=NOW,
                 effective_at=NOW, default_action=default, rules=tuple(rules))


def _rule(rid, cond, action, sev, fail_mode=None):
    return Rule(id=rid, condition=cond, description=rid, action=action,
                severity=sev, fail_mode=fail_mode)


def _engine():
    return PolicyEngine(audit_sink=lambda rec: None)


def _decide(cond, score, action=Action.BLOCK, sev=Severity.CRITICAL,
            default=Action.ALLOW, field="bias_score"):
    ctx = SignalContext(values={field: score, "bias_evaluated": True})
    pol = _policy([_rule("r", cond, action, sev)], default=default)
    return _engine().simulate(pol, ctx, EnforcementMode.ENFORCE)


# ── Signed zero ────────────────────────────────────────────────────────────────

def test_negative_zero_equals_zero():
    d = _decide("bias_score == 0.0", -0.0)
    assert d.decided_action == Action.BLOCK          # -0.0 == 0.0 → rule fires


def test_negative_zero_not_less_than_zero():
    d = _decide("bias_score < 0.0", -0.0)
    assert d.decided_action == Action.ALLOW          # -0.0 < 0.0 is False


# ── Subnormal floats ───────────────────────────────────────────────────────────

def test_smallest_subnormal_is_finite_and_compares():
    d = _decide("bias_score < 40", 5e-324)           # smallest positive subnormal
    assert d.decided_action == Action.BLOCK          # finite, < 40 → fires (not suppressed)


# ── Exact float boundaries ─────────────────────────────────────────────────────

def test_just_below_threshold_fires():
    d = _decide("bias_score < 40", 39.999999999)
    assert d.decided_action == Action.BLOCK


def test_exact_threshold_does_not_fire_strict_lt():
    d = _decide("bias_score < 40", 40.0)
    assert d.decided_action == Action.ALLOW


def test_exact_threshold_fires_on_lte():
    d = _decide("bias_score <= 40", 40.0)
    assert d.decided_action == Action.BLOCK


# ── Magnitude extremes + overflow to inf ───────────────────────────────────────

def test_huge_finite_magnitude_compares():
    d = _decide("bias_score > 40", 1e308)
    assert d.decided_action == Action.BLOCK          # finite, > 40 → fires


def test_overflow_to_inf_is_suppressed_fail_closed():
    """A literal that overflows to +inf (1e309) is non-finite → normalized to missing
    at context construction (F-FAILOPEN-NAN-1 machinery) → fail-closed, never read as a
    raw inf that silently slips a `< 40` floor."""
    inf = 1e309
    assert inf == float("inf")
    ctx = SignalContext(values={"bias_score": inf, "bias_evaluated": True})
    assert ctx.values["bias_score"] is None
    pol = _policy([_rule("r", "bias_score < 40", Action.BLOCK, Severity.CRITICAL)])
    d = _engine().simulate(pol, ctx, EnforcementMode.ENFORCE)
    assert d.decided_action == Action.BLOCK
    assert d.fail_mode_applied == FailMode.FAIL_CLOSED


# ── int vs float coercion (Python-native, intended) ────────────────────────────

def test_int_equals_float_value():
    d = _decide("bias_score == 40.0", 40)             # int 40 == float 40.0
    assert d.decided_action == Action.BLOCK


def test_int_score_strict_compare():
    d = _decide("bias_score < 40.0", 40)
    assert d.decided_action == Action.ALLOW


# ── String-vs-number confusion (upstream type defect) ──────────────────────────
# The context declares *_score as numeric but does NOT coerce/enforce the type
# (SIGNAL_FIELDS is "documentation + light validation"). A string-typed score is an
# upstream production defect; we characterize how the engine handles it.

def test_string_score_ordering_fails_closed():
    """`"40" < 40` raises TypeError → ConditionRuntimeError → fail_mode. On a CRITICAL
    rule that is FAIL_CLOSED → BLOCK. Ordering comparisons are SAFE against a string."""
    d = _decide("bias_score < 40", "40")
    assert d.decided_action == Action.BLOCK
    assert d.fail_mode_applied == FailMode.FAIL_CLOSED


def test_string_score_equality_silently_mismatches_PROBE():
    """PROBE (report-only, EF-TYPE-COERCE-1): equality does NOT raise — `"40" == 40` is
    False — so a string-typed score silently fails to match an `== N` rule rather than
    erroring into fail_mode. Not a fail-open of an enforcement rule per se (the rule
    just doesn't fire and the SAFE default applies here), but it means declared numeric
    types are not enforced at the boundary. Documents the ACTUAL behavior."""
    d = _decide("bias_score == 40", "40", default=Action.ALLOW)
    assert d.decided_action == Action.ALLOW          # rule did NOT fire on the string
    # And the inverse `!=` DOES fire (a string is != the number), confirming the
    # comparison ran without a type error rather than being suppressed.
    d2 = _decide("bias_score != 40", "40", action=Action.BLOCK, default=Action.ALLOW)
    assert d2.decided_action == Action.BLOCK
