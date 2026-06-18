"""Domain 3.2 — Determinism & Resolution Integrity  [NIST AI RMF MEASURE].

Guarantees under test:
  * Byte-identical decisions for identical inputs, including under concurrency
    (engine.py:124-141 signature; resolution.py:11-12).
  * Strict 4-level precedence: severity > restrictiveness > priority > document order
    (resolution.py:59-67), and the engine reports which level decided.
  * Checksum determinism + immutability/version change-control (schema.py:222-315).

PASS = guarantee held. FAIL = defeated. No production code is modified.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

import pytest

from src.policy.context import SignalContext
from src.policy.engine import PolicyEngine
from src.policy.resolution import Candidate, resolve
from src.policy.schema import (
    Action,
    EffectivePolicyMutationError,
    EnforcementMode,
    FailMode,
    Policy,
    PolicyError,
    Rule,
    Severity,
)

NOW = datetime(2026, 1, 1, tzinfo=timezone.utc)


def _policy(rules, default=Action.ALLOW, pid="pol_adv", version=1):
    return Policy(
        policy_id=pid,
        version=version,
        created_by="qa",
        created_at=NOW,
        effective_at=NOW,
        default_action=default,
        rules=tuple(rules),
    )


def _rule(rid, cond, action, sev, priority=0, fail_mode=None):
    return Rule(
        id=rid,
        condition=cond,
        description=rid,
        action=action,
        severity=sev,
        priority=priority,
        fail_mode=fail_mode,
    )


def _ctx(**vals):
    return SignalContext(values=vals)


# ── 1. Concurrency: identical inputs → byte-identical signature ────────────────

def test_concurrent_decisions_are_byte_identical():
    """Same (policy, context) across many threads on a SHARED engine (shared compile
    cache, schema.py / engine.py:185) must yield one identical signature — no race in
    resolution or the cache."""
    engine = PolicyEngine(audit_sink=lambda rec: None)
    policy = _policy(
        [
            _rule("r_block", "safety_score < 50", Action.BLOCK, Severity.CRITICAL),
            _rule("r_disc", "bias_score < 70", Action.DISCLAIMER, Severity.LOW),
        ]
    )
    ctx = _ctx(safety_score=10, safety_evaluated=True, bias_score=40, bias_evaluated=True)

    def run(_):
        return engine.simulate(policy, ctx, EnforcementMode.ENFORCE).signature()

    with ThreadPoolExecutor(max_workers=16) as pool:
        sigs = list(pool.map(run, range(400)))

    first = sigs[0]
    assert all(s == first for s in sigs), "non-deterministic decision under concurrency"
    assert first["winning_rule_id"] == "r_block"
    assert first["decided_action"] == "block"


# ── 2. Precedence ordering ─────────────────────────────────────────────────────

def test_severity_outranks_more_restrictive_action():
    """Severity is the FIRST precedence level: a CRITICAL allow must beat a LOW block."""
    policy = _policy(
        [
            _rule("low_block", "safety_score < 90", Action.BLOCK, Severity.LOW),
            _rule("crit_allow", "safety_score < 90", Action.ALLOW, Severity.CRITICAL),
        ]
    )
    engine = PolicyEngine(audit_sink=lambda r: None)
    d = engine.simulate(policy, _ctx(safety_score=10, safety_evaluated=True),
                        EnforcementMode.SHADOW)
    assert d.winning_rule_id == "crit_allow"
    assert d.decided_by == "severity"


def test_four_way_tie_resolves_on_document_order_deterministically():
    """All four precedence levels equal → earliest document position wins, every time."""
    common = dict(action=Action.ESCALATE, sev=Severity.HIGH, priority=5)
    policy = _policy(
        [
            _rule("first", "safety_score < 90", **_kw(common)),
            _rule("second", "bias_score < 90", **_kw(common)),
        ]
    )
    engine = PolicyEngine(audit_sink=lambda r: None)
    ctx = _ctx(safety_score=1, safety_evaluated=True, bias_score=1, bias_evaluated=True)
    for _ in range(50):
        d = engine.simulate(policy, ctx, EnforcementMode.SHADOW)
        assert d.winning_rule_id == "first"
        assert d.decided_by == "order"


def test_document_order_only_decides_when_legitimately_the_decider():
    """Reversing document order changes the winner ONLY because order is the genuine
    tie-break here (all higher levels equal). With a higher-severity rule present,
    document order must NOT override it."""
    engine = PolicyEngine(audit_sink=lambda r: None)
    ctx = _ctx(safety_score=1, safety_evaluated=True, bias_score=1, bias_evaluated=True)

    a = _rule("a", "safety_score < 90", Action.ESCALATE, Severity.HIGH, priority=5)
    b = _rule("b", "bias_score < 90", Action.ESCALATE, Severity.HIGH, priority=5)
    assert engine.simulate(_policy([a, b], pid="p1"), ctx).winning_rule_id == "a"
    assert engine.simulate(_policy([b, a], pid="p2"), ctx).winning_rule_id == "b"

    # Now make 'b' critical: it must win regardless of being second in the document.
    b_crit = _rule("b", "bias_score < 90", Action.ESCALATE, Severity.CRITICAL, priority=5)
    d = engine.simulate(_policy([a, b_crit], pid="p3"), ctx)
    assert d.winning_rule_id == "b" and d.decided_by == "severity"


# ── 3. Integer-overflow / extreme priority ─────────────────────────────────────

def test_extreme_priority_values_do_not_invert_higher_precedence():
    """A gigantic priority on a low-severity rule must NOT beat a higher-severity rule
    (priority is BELOW severity in precedence). Python ints are unbounded — confirm no
    truncation/overflow flips the order (resolution.py:59-67)."""
    engine = PolicyEngine(audit_sink=lambda r: None)
    ctx = _ctx(safety_score=1, safety_evaluated=True, bias_score=1, bias_evaluated=True)
    huge = _rule("huge", "safety_score < 90", Action.ALLOW, Severity.LOW, priority=2**63)
    crit = _rule("crit", "bias_score < 90", Action.BLOCK, Severity.CRITICAL, priority=-(2**63))
    d = engine.simulate(_policy([huge, crit]), ctx)
    assert d.winning_rule_id == "crit" and d.decided_by == "severity"


def test_priority_breaks_tie_at_equal_severity_and_action():
    engine = PolicyEngine(audit_sink=lambda r: None)
    ctx = _ctx(safety_score=1, safety_evaluated=True, bias_score=1, bias_evaluated=True)
    lo = _rule("lo", "safety_score < 90", Action.ESCALATE, Severity.HIGH, priority=1)
    hi = _rule("hi", "bias_score < 90", Action.ESCALATE, Severity.HIGH, priority=999)
    d = engine.simulate(_policy([lo, hi]), ctx)
    assert d.winning_rule_id == "hi" and d.decided_by == "priority"


# ── 4. Malformed / contradictory / empty policies ──────────────────────────────

def test_empty_policy_returns_declared_default_never_implicit_allow():
    engine = PolicyEngine(audit_sink=lambda r: None)
    d = engine.simulate(_policy([], default=Action.ESCALATE),
                        _ctx(safety_score=99, safety_evaluated=True))
    assert d.decided_action == Action.ESCALATE
    assert d.decided_by == "default_action"
    assert d.winning_rule_id is None


def test_duplicate_rule_ids_rejected_at_construction():
    with pytest.raises(PolicyError):
        _policy(
            [
                _rule("dup", "safety_score < 90", Action.BLOCK, Severity.HIGH),
                _rule("dup", "bias_score < 90", Action.ALLOW, Severity.LOW),
            ]
        )


def test_single_failing_condition_critical_fails_closed_to_block():
    """A single critical rule whose signal is missing must fail CLOSED to BLOCK,
    never resolve to the default allow (engine.py:336-359, :442-449)."""
    engine = PolicyEngine(audit_sink=lambda r: None)
    policy = _policy(
        [_rule("crit", "compliance_score < 50", Action.BLOCK, Severity.CRITICAL)],
        default=Action.ALLOW,
    )
    # compliance signal absent → MissingSignalError → fail_closed
    d = engine.simulate(policy, _ctx(safety_score=99, safety_evaluated=True),
                        EnforcementMode.ENFORCE)
    assert d.decided_action == Action.BLOCK
    assert d.fail_mode_applied == FailMode.FAIL_CLOSED
    assert d.enforced is True


# ── 5. Checksum determinism + immutability (change-control) ────────────────────

def test_identical_logical_policy_same_checksum():
    p1 = _policy([_rule("r", "safety_score < 90", Action.BLOCK, Severity.HIGH)])
    p2 = _policy([_rule("r", "safety_score < 90", Action.BLOCK, Severity.HIGH)])
    assert p1.checksum == p2.checksum


def test_numeric_literal_repr_change_yields_different_checksum_no_collision():
    """'90' vs '90.0' in a condition are different decision logic → different checksum.
    Confirms the checksum can't be collided by numeric-representation tricks (the
    condition is committed as its exact source string)."""
    p1 = _policy([_rule("r", "safety_score < 90", Action.BLOCK, Severity.HIGH)])
    p2 = _policy([_rule("r", "safety_score < 90.0", Action.BLOCK, Severity.HIGH)])
    assert p1.checksum != p2.checksum


def test_effective_policy_is_immutable():
    p = _policy([_rule("r", "safety_score < 90", Action.BLOCK, Severity.HIGH)])
    with pytest.raises(EffectivePolicyMutationError):
        p.version = 99
    with pytest.raises(EffectivePolicyMutationError):
        del p.rules


def test_supplied_wrong_checksum_is_rejected():
    with pytest.raises(PolicyError):
        Policy(
            policy_id="p",
            version=1,
            created_by="qa",
            created_at=NOW,
            effective_at=NOW,
            default_action=Action.ALLOW,
            rules=(_rule("r", "safety_score < 90", Action.BLOCK, Severity.HIGH),),
            checksum="sha256:deadbeef",
        )


def test_cache_rejects_same_version_with_different_checksum():
    """load_policy must refuse a second policy that reuses (id, version) but has
    different decision logic (engine.py:200-207) — versions are immutable."""
    engine = PolicyEngine(audit_sink=lambda r: None)
    p1 = _policy([_rule("r", "safety_score < 90", Action.BLOCK, Severity.HIGH)],
                 pid="same", version=1)
    engine.load_policy(p1)
    p2 = _policy([_rule("r", "bias_score < 90", Action.ALLOW, Severity.LOW)],
                 pid="same", version=1)
    with pytest.raises(ValueError):
        engine.load_policy(p2)


# ── helpers ────────────────────────────────────────────────────────────────────

def _kw(common):
    return {"action": common["action"], "sev": common["sev"], "priority": common["priority"]}
