"""Edge battery — resolution-order torture (determinism under stress).

Pushes §2.3 precedence + tie-break harder than the Phase-3 pass: thousands of
simultaneously-matching rules, total ties on every precedence level, fallback-only
("errored → fail-closed") matches, reload idempotency, and default_action interaction
when it is the most vs least restrictive verb. Built against the REAL engine/resolver.

All HELD — resolution is deterministic and stable.
"""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from src.policy.context import SignalContext
from src.policy.engine import PolicyEngine
from src.policy.resolution import Candidate, resolve
from src.policy.schema import Action, EnforcementMode, FailMode, Policy, Rule, Severity

NOW = datetime(2026, 1, 1, tzinfo=timezone.utc)


def _policy(rules, default=Action.ALLOW, pid="res", version=1):
    return Policy(policy_id=pid, version=version, created_by="qa", created_at=NOW,
                 effective_at=NOW, default_action=default, rules=tuple(rules))


def _rule(rid, cond, action, sev, priority=0, fail_mode=None):
    return Rule(id=rid, condition=cond, description=rid, action=action,
                severity=sev, priority=priority, fail_mode=fail_mode)


def _engine():
    return PolicyEngine(audit_sink=lambda rec: None)


def _ctx(**kw):
    base = {"safety_score": 10, "safety_evaluated": True}
    base.update(kw)
    return SignalContext(values=base)


# ── Thousands of simultaneously-matching rules ─────────────────────────────────

def test_thousands_of_matching_rules_resolve_deterministically():
    n = 5000
    # All match; all identical sev/action/priority → document order is the only separator.
    rules = [_rule(f"r{i}", "safety_score < 90", Action.BLOCK, Severity.HIGH) for i in range(n)]
    pol = _policy(rules)
    d1 = _engine().simulate(pol, _ctx(), EnforcementMode.ENFORCE)
    d2 = _engine().simulate(pol, _ctx(), EnforcementMode.ENFORCE)
    assert d1.winning_rule_id == "r0"          # earliest in document order wins
    assert d1.decided_by == "order"
    assert d1.signature() == d2.signature()    # byte-identical across runs


def test_total_tie_on_every_level_resolves_on_document_order():
    rules = [
        _rule("a", "safety_score < 90", Action.BLOCK, Severity.CRITICAL, priority=7),
        _rule("b", "safety_score < 90", Action.BLOCK, Severity.CRITICAL, priority=7),
        _rule("c", "safety_score < 90", Action.BLOCK, Severity.CRITICAL, priority=7),
    ]
    d = _engine().simulate(_policy(rules), _ctx(), EnforcementMode.ENFORCE)
    assert d.winning_rule_id == "a" and d.decided_by == "order"


def test_severity_outranks_document_order():
    rules = [
        _rule("low_first", "safety_score < 90", Action.BLOCK, Severity.LOW),
        _rule("crit_later", "safety_score < 90", Action.BLOCK, Severity.CRITICAL),
    ]
    d = _engine().simulate(_policy(rules), _ctx(), EnforcementMode.ENFORCE)
    assert d.winning_rule_id == "crit_later" and d.decided_by == "severity"


def test_restrictiveness_breaks_severity_tie():
    rules = [
        _rule("allow_rule", "safety_score < 90", Action.ALLOW, Severity.HIGH),
        _rule("block_rule", "safety_score < 90", Action.BLOCK, Severity.HIGH),
    ]
    d = _engine().simulate(_policy(rules), _ctx(), EnforcementMode.ENFORCE)
    assert d.winning_rule_id == "block_rule" and d.decided_by == "restrictiveness"


# ── Fallback-only match (errored → fail-closed contributes a candidate) ────────

def test_fallback_only_rule_still_competes_as_worstcase():
    """A rule whose signal is MISSING never matches normally, but with FAIL_CLOSED it
    enters resolution as its worst-case action and can win — a 'match only under
    fallback conditions'."""
    # compliance_score is absent → MissingSignalError → fail-closed.
    fallback = _rule("compliance_guard", "compliance_score < 50", Action.ALLOW,
                     Severity.CRITICAL, fail_mode=FailMode.FAIL_CLOSED)
    benign = _rule("benign", "safety_score < 90", Action.DISCLAIMER, Severity.LOW)
    d = _engine().simulate(_policy([benign, fallback]), _ctx(), EnforcementMode.ENFORCE)
    assert d.winning_rule_id == "compliance_guard"
    assert d.decided_action == Action.BLOCK         # critical fail-closed worst-case
    assert d.fail_mode_applied == FailMode.FAIL_CLOSED


# ── Reload idempotency / stability ─────────────────────────────────────────────

def test_reload_same_version_is_stable():
    eng = _engine()
    pol = _policy([_rule("r", "safety_score < 90", Action.BLOCK, Severity.HIGH)])
    d_first = eng.simulate(pol, _ctx(), EnforcementMode.ENFORCE)
    eng.load_policy(pol)  # explicit reload (cached)
    eng.load_policy(pol)
    d_again = eng.simulate(pol, _ctx(), EnforcementMode.ENFORCE)
    assert d_first.signature() == d_again.signature()


def test_resolve_is_order_independent_for_the_winner_set():
    """resolve() consumes candidates; the winner is determined by the sort key, not by
    the order candidates are passed (document order is encoded in order_index)."""
    r_hi = _rule("hi", "safety_score < 90", Action.BLOCK, Severity.CRITICAL)
    r_lo = _rule("lo", "safety_score < 90", Action.BLOCK, Severity.LOW)
    c_hi = Candidate(rule=r_hi, order_index=5, effective_action=Action.BLOCK)
    c_lo = Candidate(rule=r_lo, order_index=0, effective_action=Action.BLOCK)
    w1 = resolve([c_hi, c_lo]).winner
    w2 = resolve([c_lo, c_hi]).winner
    assert w1.rule.id == "hi" and w2.rule.id == "hi"   # severity beats earlier order_index


# ── default_action interaction (no rule matches) ───────────────────────────────

def test_default_action_most_restrictive_when_no_match():
    pol = _policy([_rule("r", "safety_score < 5", Action.BLOCK, Severity.HIGH)],
                  default=Action.BLOCK)
    d = _engine().simulate(pol, _ctx(safety_score=99), EnforcementMode.ENFORCE)
    assert d.decided_action == Action.BLOCK and d.decided_by == "default_action"
    assert d.enforced is True


def test_default_action_least_restrictive_when_no_match():
    pol = _policy([_rule("r", "safety_score < 5", Action.BLOCK, Severity.HIGH)],
                  default=Action.ALLOW)
    d = _engine().simulate(pol, _ctx(safety_score=99), EnforcementMode.ENFORCE)
    assert d.decided_action == Action.ALLOW and d.decided_by == "default_action"
    assert d.enforced is False
