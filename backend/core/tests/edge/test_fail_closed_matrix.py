"""Edge battery — EXHAUSTIVE fail-closed completeness sweep [OWASP LLM06].

The Phase-3 pass spot-checked "a skipped/degraded/missing signal is never a silent
allow". This makes it a full matrix at the engine layer:

    every pillar signal  ×  every degradation form  ×  every fail_mode

Degradation forms (every way a signal can fail to be a usable number):
  missing · explicit None · NaN · +Inf · -Inf · status=partial · status=failed ·
  status=skipped · demographic_fast_path · fallback flag

Assertions per cell:
  * FAIL_CLOSED rule  → decided_action is a GATING worst-case (BLOCK/ESCALATE), the
    rule row is recorded errored with fail_mode_applied=FAIL_CLOSED. NEVER allow.
  * FAIL_OPEN rule    → the rule row is recorded errored + non-firing (visible in the
    audit, never silently False); the verdict falls to the policy's DECLARED default
    (decided_by=default_action), not a silent rule pass.

(The runtime triggers — timeout / breaker-open / exhausted-providers / raised
exception / backpressure — are covered at the runtime layer in
tests/adversarial/test_fail_open_runtime.py; here we sweep how they manifest to the
engine: an un-evaluated / missing / non-finite signal.)
"""

from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from src.policy.context import SignalContext
from src.policy.engine import PolicyEngine
from src.policy.schema import Action, EnforcementMode, FailMode, Policy, Rule, Severity

NOW = datetime(2026, 1, 1, tzinfo=timezone.utc)

PILLARS = ["safety", "hallucination", "bias", "prompt_security", "compliance"]
PILLAR_ID = {
    "safety": "safety_toxicity",
    "hallucination": "hallucination",
    "bias": "bias_fairness",
    "prompt_security": "prompt_security",
    "compliance": "compliance_policy",
}
FORMS = [
    "missing", "none", "nan", "posinf", "neginf",
    "partial", "failed", "skipped", "fast_path", "fallback",
]
GATING = {Action.BLOCK, Action.ESCALATE}


def _pillar(score=None, status="success", details=None):
    return SimpleNamespace(
        status=status,
        details=details or {},
        score=SimpleNamespace(value=score) if score is not None else None,
    )


def _ctx(prefix: str, form: str) -> SignalContext:
    if form == "missing":
        return SignalContext(values={f"{prefix}_evaluated": False})  # score absent entirely
    if form == "none":
        return SignalContext(values={f"{prefix}_score": None, f"{prefix}_evaluated": True})
    if form == "nan":
        return SignalContext(values={f"{prefix}_score": float("nan"), f"{prefix}_evaluated": True})
    if form == "posinf":
        return SignalContext(values={f"{prefix}_score": float("inf"), f"{prefix}_evaluated": True})
    if form == "neginf":
        return SignalContext(values={f"{prefix}_score": float("-inf"), f"{prefix}_evaluated": True})

    pid = PILLAR_ID[prefix]
    if form == "partial":
        return SignalContext.from_pillar_results({pid: _pillar(score=95, status="partial")})
    if form == "failed":
        return SignalContext.from_pillar_results({pid: _pillar(score=95, status="failed")})
    if form == "skipped":
        return SignalContext.from_pillar_results({pid: _pillar(score=95, status="skipped")})
    if form == "fast_path":
        return SignalContext.from_pillar_results(
            {pid: _pillar(score=92, details={"method": "demographic_fast_path"})})
    if form == "fallback":
        return SignalContext.from_pillar_results(
            {pid: _pillar(score=50, details={"fallback": True})})
    raise AssertionError(form)


def _policy(rule, default=Action.ALLOW):
    return Policy(policy_id="fcm", version=1, created_by="qa", created_at=NOW,
                 effective_at=NOW, default_action=default, rules=(rule,))


def _engine():
    return PolicyEngine(audit_sink=lambda rec: None)


@pytest.mark.parametrize("prefix", PILLARS)
@pytest.mark.parametrize("form", FORMS)
def test_fail_closed_never_silently_allows(prefix, form):
    ctx = _ctx(prefix, form)
    # Whatever the degradation form, the score is unusable (None / absent) so a rule
    # referencing it cannot read a number. (The *_evaluated flag varies by form — e.g.
    # the "none" form models an inconsistent score=None / evaluated=True signal.)
    assert ctx.values.get(f"{prefix}_score") is None

    rule = Rule(id="g", condition=f"{prefix}_score < 40", description="guard",
                action=Action.ALLOW, severity=Severity.CRITICAL,
                fail_mode=FailMode.FAIL_CLOSED)
    d = _engine().simulate(_policy(rule), ctx, EnforcementMode.ENFORCE)

    assert d.decided_action in GATING, f"{prefix}/{form}: fail-closed produced {d.decided_action}"
    assert d.decided_action != Action.ALLOW
    row = [re for re in d.rule_evaluations if re.rule_id == "g"][0]
    assert row.errored is True
    assert row.fail_mode_applied == FailMode.FAIL_CLOSED
    assert d.enforced is True


@pytest.mark.parametrize("prefix", PILLARS)
@pytest.mark.parametrize("form", FORMS)
def test_fail_open_is_recorded_never_silently_false(prefix, form):
    ctx = _ctx(prefix, form)
    rule = Rule(id="g", condition=f"{prefix}_score < 40", description="guard",
                action=Action.BLOCK, severity=Severity.LOW,
                fail_mode=FailMode.FAIL_OPEN)
    d = _engine().simulate(_policy(rule, default=Action.ALLOW), ctx, EnforcementMode.ENFORCE)

    row = [re for re in d.rule_evaluations if re.rule_id == "g"][0]
    assert row.errored is True                       # recorded, not silent
    assert row.matched is False                       # did not fire
    assert row.fail_mode_applied == FailMode.FAIL_OPEN
    # The allow came from the DECLARED default, transparently — not a silent rule pass.
    assert d.decided_by == "default_action"
    assert d.decided_action == Action.ALLOW


def test_matrix_is_actually_exhaustive():
    """Guard against silent shrinkage of the matrix."""
    assert len(PILLARS) == 5 and len(FORMS) == 10
    # 5 pillars × 10 forms × 2 fail-modes = 100 enumerated cells.
