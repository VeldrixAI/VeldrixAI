"""Policy Engine — unit test suite (zero LLM / zero network).

Maps 1:1 to the Binary Acceptance Checklist (§5) and the §2.8 enforcement-mode
checklist. Every test is pure CPU; the engine is exercised through a recording
audit sink so no connectors traffic occurs.
"""

from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

import pytest

from src.policy import (
    Action,
    EffectivePolicyMutationError,
    EnforcementMode,
    FailMode,
    Policy,
    PolicyEngine,
    Rule,
    Severity,
    SignalContext,
    compile_condition,
)
from src.policy.evaluator import (
    ConditionError,
    UnknownFieldError,
)
from src.policy.schema import DEFAULT_ENFORCEMENT_MODE


# ═══════════════════════════════════════════════════════════════════════════════
#  helpers / fixtures
# ═══════════════════════════════════════════════════════════════════════════════

_NOW = datetime(2026, 6, 14, 12, 0, 0, tzinfo=timezone.utc)


def make_policy(*rules: Rule, default_action: Action = Action.ESCALATE,
                version: int = 1, policy_id: str = "pol_test") -> Policy:
    return Policy(
        policy_id=policy_id,
        version=version,
        created_by="tester",
        created_at=_NOW,
        effective_at=_NOW,
        default_action=default_action,
        rules=tuple(rules),
    )


def ctx(**fields) -> SignalContext:
    return SignalContext(values=fields)


class RecordingSink:
    """Captures audit records instead of POSTing them."""

    def __init__(self):
        self.records = []

    def __call__(self, record):
        self.records.append(record)


@pytest.fixture
def sink():
    return RecordingSink()


@pytest.fixture
def engine(sink):
    return PolicyEngine(audit_sink=sink)


# ═══════════════════════════════════════════════════════════════════════════════
#  determinism
# ═══════════════════════════════════════════════════════════════════════════════


def test_determinism_1000_runs_byte_identical(engine):
    policy = make_policy(
        Rule("r_block", "safety_score < 40", "demo", Action.BLOCK, Severity.CRITICAL),
        Rule("r_warn", "hallucination_score < 60", "demo", Action.DISCLAIMER, Severity.LOW),
        default_action=Action.ALLOW,
    )
    signals = ctx(safety_score=30.0, safety_evaluated=True,
                  hallucination_score=55.0, hallucination_evaluated=True)

    first = json.dumps(engine.simulate(policy, signals).signature(), sort_keys=True)
    for _ in range(1000):
        again = json.dumps(engine.simulate(policy, signals).signature(), sort_keys=True)
        assert again == first


# ═══════════════════════════════════════════════════════════════════════════════
#  sandbox — the condition evaluator rejects code-execution attempts
# ═══════════════════════════════════════════════════════════════════════════════


@pytest.mark.parametrize(
    "expr",
    [
        "__import__('os').system('id')",       # call + unknown name
        "os.system('id')",                     # attribute + call
        "(1).__class__.__bases__",             # attribute traversal
        "eval('1+1')",                         # call to eval
        "exec('x=1')",                         # call to exec
        "data_categories[0] == 'pii'",         # subscript
        "bias_score + 1 > 2",                  # arithmetic BinOp
        "(lambda: 1)() == 1",                  # lambda + call
        "[x for x in data_categories]",        # comprehension
        "len(data_categories) > 0",            # builtin call
        "safety_score.__class__ == float",     # attribute on a field
    ],
)
def test_evaluator_rejects_sandbox_escapes(expr):
    with pytest.raises(ConditionError):
        compile_condition(expr)


def test_evaluator_has_no_eval_or_exec_in_source():
    """Defense-in-depth: the evaluator module must not *call* eval/exec/pickle.

    Uses a word-boundary regex so legitimate identifiers like ``_eval_node`` and
    ``.evaluate(`` are not false positives.
    """
    import re

    src = (Path(__file__).resolve().parents[1] / "src" / "policy" / "evaluator.py").read_text(encoding="utf-8")
    assert re.search(r"(?<![\w.])eval\s*\(", src) is None
    assert re.search(r"(?<![\w.])exec\s*\(", src) is None
    assert "import pickle" not in src and "pickle." not in src


# ═══════════════════════════════════════════════════════════════════════════════
#  unknown field → rule errors (never silently false)
# ═══════════════════════════════════════════════════════════════════════════════


def test_unknown_field_rejected_at_compile():
    with pytest.raises(UnknownFieldError):
        compile_condition("nonexistent_field > 1")


def test_unknown_field_in_policy_fails_at_load(engine):
    bad = make_policy(
        Rule("r_bad", "totally_made_up_signal < 10", "demo", Action.BLOCK, Severity.HIGH),
    )
    with pytest.raises(UnknownFieldError):
        engine.load_policy(bad)


# ═══════════════════════════════════════════════════════════════════════════════
#  missing signal on a critical rule → fails closed
# ═══════════════════════════════════════════════════════════════════════════════


def test_missing_critical_signal_fails_closed(engine):
    # bias was not evaluated → bias_score is missing/None.
    policy = make_policy(
        Rule("r_crit", "bias_score < 40", "block biased", Action.BLOCK,
             Severity.CRITICAL, fail_mode=FailMode.FAIL_CLOSED),
        default_action=Action.ALLOW,
    )
    signals = ctx(bias_evaluated=False)  # bias_score absent

    d = engine.decide(policy, signals, EnforcementMode.ENFORCE)
    assert d.decided_action == Action.BLOCK          # worst-case, not a silent allow
    assert d.decided_severity == Severity.CRITICAL
    assert d.fail_mode_applied == FailMode.FAIL_CLOSED
    won = [re for re in d.rule_evaluations if re.won][0]
    assert won.errored and won.error_type == "MissingSignalError"


def test_missing_signal_fail_open_does_not_fire(engine):
    policy = make_policy(
        Rule("r_open", "bias_score < 40", "low-sev", Action.DISCLAIMER,
             Severity.LOW, fail_mode=FailMode.FAIL_OPEN),
        default_action=Action.ALLOW,
    )
    d = engine.simulate(policy, ctx(bias_evaluated=False))
    assert d.decided_action == Action.ALLOW          # default; errored rule did not fire
    errored = [re for re in d.rule_evaluations if re.rule_id == "r_open"][0]
    assert errored.errored and errored.matched is False
    assert errored.fail_mode_applied == FailMode.FAIL_OPEN  # recorded, not silently dropped


# ═══════════════════════════════════════════════════════════════════════════════
#  score=92 fast-path must surface as evaluated:false, never a passing score
# ═══════════════════════════════════════════════════════════════════════════════


def _bias_fastpath_result():
    """Duck-typed PillarResult mimicking the bias score=92 demographic fast-path."""
    return SimpleNamespace(
        status=SimpleNamespace(value="success"),
        score=SimpleNamespace(value=92.0),
        details={"method": "demographic_fast_path", "nim_risk_score": 0.08},
        flags=[],
    )


def _real_result(pillar_score, risk):
    return SimpleNamespace(
        status=SimpleNamespace(value="success"),
        score=SimpleNamespace(value=pillar_score),
        details={"method": "nim_api", "nim_risk_score": risk},
        flags=[],
    )


def test_score_92_fastpath_is_not_evaluated():
    sc = SignalContext.from_pillar_results({"bias_fairness": _bias_fastpath_result()})
    assert sc.get("bias_evaluated") is False
    assert sc.get("bias_score") is None      # the 92 is suppressed, never readable as a pass


def test_rule_can_target_not_evaluated(engine):
    sc = SignalContext.from_pillar_results({"bias_fairness": _bias_fastpath_result()})
    policy = make_policy(
        Rule("r_skip", "bias_evaluated == False", "flag skipped bias", Action.ESCALATE,
             Severity.MEDIUM),
        default_action=Action.ALLOW,
    )
    d = engine.simulate(policy, sc)
    assert d.decided_action == Action.ESCALATE
    assert d.winning_rule_id == "r_skip"


def test_rule_on_missing_score_for_skipped_pillar_errors(engine):
    sc = SignalContext.from_pillar_results({"bias_fairness": _bias_fastpath_result()})
    policy = make_policy(
        Rule("r_score", "bias_score < 40", "would read 92 as pass — must not", Action.BLOCK,
             Severity.HIGH, fail_mode=FailMode.FAIL_CLOSED),
        default_action=Action.ALLOW,
    )
    d = engine.simulate(policy, sc)
    won = [re for re in d.rule_evaluations if re.won][0]
    assert won.errored  # could not read a real score → did not pass through as 92


# ═══════════════════════════════════════════════════════════════════════════════
#  resolution precedence — all four tie-break levels
# ═══════════════════════════════════════════════════════════════════════════════


def test_tiebreak_severity(engine):
    policy = make_policy(
        Rule("low", "safety_score < 90", "x", Action.BLOCK, Severity.LOW),
        Rule("crit", "safety_score < 90", "x", Action.DISCLAIMER, Severity.CRITICAL),
    )
    d = engine.simulate(policy, ctx(safety_score=10.0, safety_evaluated=True))
    assert d.winning_rule_id == "crit"
    assert d.decided_by == "severity"


def test_tiebreak_restrictiveness(engine):
    policy = make_policy(
        Rule("mask", "safety_score < 90", "x", Action.MASK, Severity.HIGH),
        Rule("block", "safety_score < 90", "x", Action.BLOCK, Severity.HIGH),
    )
    d = engine.simulate(policy, ctx(safety_score=10.0, safety_evaluated=True))
    assert d.winning_rule_id == "block"
    assert d.decided_by == "restrictiveness"


def test_tiebreak_priority(engine):
    policy = make_policy(
        Rule("p1", "safety_score < 90", "x", Action.BLOCK, Severity.HIGH, priority=1),
        Rule("p9", "safety_score < 90", "x", Action.BLOCK, Severity.HIGH, priority=9),
    )
    d = engine.simulate(policy, ctx(safety_score=10.0, safety_evaluated=True))
    assert d.winning_rule_id == "p9"
    assert d.decided_by == "priority"


def test_tiebreak_document_order(engine):
    policy = make_policy(
        Rule("first", "safety_score < 90", "x", Action.BLOCK, Severity.HIGH, priority=5),
        Rule("second", "safety_score < 90", "x", Action.BLOCK, Severity.HIGH, priority=5),
    )
    d = engine.simulate(policy, ctx(safety_score=10.0, safety_evaluated=True))
    assert d.winning_rule_id == "first"
    assert d.decided_by == "order"


# ═══════════════════════════════════════════════════════════════════════════════
#  engine internal exception → fails closed + engine_error record
# ═══════════════════════════════════════════════════════════════════════════════


def test_engine_internal_error_fails_closed(engine, sink, monkeypatch):
    policy = make_policy(
        Rule("r", "safety_score < 40", "x", Action.ALLOW, Severity.HIGH),
    )
    # Force an internal fault deep in resolution.
    import src.policy.engine as engine_mod

    def boom(_candidates):
        raise RuntimeError("synthetic engine fault")

    monkeypatch.setattr(engine_mod, "resolve", boom)

    d = engine.decide(policy, ctx(safety_score=10.0, safety_evaluated=True),
                      EnforcementMode.ENFORCE)
    assert d.engine_error is True
    assert d.decided_action == Action.BLOCK     # never a silent allow
    assert d.enforced is True                   # critical block gates under enforce
    assert len(sink.records) == 1
    assert sink.records[0]["record_kind"] == "policy_engine_error"


# ═══════════════════════════════════════════════════════════════════════════════
#  no matching rule → declared default_action
# ═══════════════════════════════════════════════════════════════════════════════


def test_no_match_returns_default_action_not_allow(engine):
    policy = make_policy(
        Rule("r", "safety_score < 10", "x", Action.BLOCK, Severity.HIGH),
        default_action=Action.ESCALATE,
    )
    d = engine.simulate(policy, ctx(safety_score=95.0, safety_evaluated=True))
    assert d.decided_action == Action.ESCALATE
    assert d.decided_by == "default_action"
    assert d.winning_rule_id is None


# ═══════════════════════════════════════════════════════════════════════════════
#  audit record — exactly one, complete; simulate writes none
# ═══════════════════════════════════════════════════════════════════════════════


def test_decide_writes_exactly_one_complete_record(engine, sink):
    policy = make_policy(
        Rule("r", "safety_score < 40", "x", Action.BLOCK, Severity.CRITICAL),
        default_action=Action.ALLOW,
    )
    engine.decide(policy, ctx(safety_score=10.0, safety_evaluated=True),
                  EnforcementMode.ENFORCE, request_id="req-1", tenant_id="ten-1")
    assert len(sink.records) == 1
    rec = sink.records[0]
    # Sufficient to reproduce offline: version + checksum + snapshot + all rules + reason.
    assert rec["policy_id"] == "pol_test"
    assert rec["version"] == 1
    assert rec["checksum"] == policy.checksum
    assert rec["signal_snapshot"]["safety_score"] == 10.0
    assert rec["rule_evaluations"][0]["rule_id"] == "r"
    assert rec["resolution_reason"]
    assert rec["decided_action"] == "block"
    assert rec["request_id"] == "req-1"
    assert rec["tenant_id"] == "ten-1"


def test_simulate_writes_no_audit_record(engine, sink):
    policy = make_policy(
        Rule("r", "safety_score < 40", "x", Action.BLOCK, Severity.CRITICAL),
    )
    engine.simulate(policy, ctx(safety_score=10.0, safety_evaluated=True),
                    EnforcementMode.ENFORCE)
    assert sink.records == []


# ═══════════════════════════════════════════════════════════════════════════════
#  immutability + versioning
# ═══════════════════════════════════════════════════════════════════════════════


def test_effective_policy_cannot_be_mutated():
    policy = make_policy(Rule("r", "safety_score < 40", "x", Action.BLOCK, Severity.HIGH))
    with pytest.raises(EffectivePolicyMutationError):
        policy.default_action = Action.ALLOW  # type: ignore[misc]


def test_new_version_bumps_and_rechecksums():
    v1 = make_policy(Rule("r", "safety_score < 40", "x", Action.BLOCK, Severity.HIGH))
    v2 = v1.new_version(
        rules=(Rule("r", "safety_score < 50", "x", Action.BLOCK, Severity.HIGH),)
    )
    assert v2.version == 2
    assert v2.checksum != v1.checksum
    assert v1.version == 1  # original untouched


def test_loading_same_version_with_changed_checksum_raises(engine):
    v1 = make_policy(Rule("r", "safety_score < 40", "x", Action.BLOCK, Severity.HIGH))
    engine.load_policy(v1)
    # A different policy object claiming the same (id, version) but different rules.
    impostor = Policy(
        policy_id="pol_test", version=1, created_by="x", created_at=_NOW,
        effective_at=_NOW, default_action=Action.ESCALATE,
        rules=(Rule("r", "safety_score < 99", "x", Action.BLOCK, Severity.HIGH),),
    )
    with pytest.raises(ValueError):
        engine.load_policy(impostor)


def test_supplied_checksum_mismatch_is_rejected():
    with pytest.raises(Exception):
        Policy(
            policy_id="p", version=1, created_by="x", created_at=_NOW, effective_at=_NOW,
            default_action=Action.ALLOW,
            rules=(Rule("r", "safety_score < 40", "x", Action.BLOCK, Severity.HIGH),),
            checksum="sha256:deadbeef",  # wrong
        )


# ═══════════════════════════════════════════════════════════════════════════════
#  §2.8 — enforcement mode (shadow default; gating)
# ═══════════════════════════════════════════════════════════════════════════════


def test_default_mode_is_shadow():
    assert DEFAULT_ENFORCEMENT_MODE == EnforcementMode.SHADOW


def test_fresh_tenant_defaults_to_shadow_and_does_not_gate(engine):
    """A fresh tenant (no explicit mode) cannot gate production traffic."""
    policy = make_policy(
        Rule("r", "safety_score < 40", "x", Action.BLOCK, Severity.CRITICAL),
        default_action=Action.ALLOW,
    )
    # decide() with no mode arg → DEFAULT (shadow)
    d = engine.decide(policy, ctx(safety_score=10.0, safety_evaluated=True))
    assert d.mode == EnforcementMode.SHADOW
    assert d.decided_action == Action.BLOCK
    assert d.enforced is False


def test_shadow_block_is_recorded_but_not_gated(engine, sink):
    policy = make_policy(
        Rule("r", "safety_score < 40", "x", Action.BLOCK, Severity.CRITICAL),
        default_action=Action.ALLOW,
    )
    d = engine.decide(policy, ctx(safety_score=10.0, safety_evaluated=True),
                      EnforcementMode.SHADOW)
    assert d.decided_action == Action.BLOCK and d.enforced is False
    rec = sink.records[0]
    assert rec["decided_action"] == "block"
    assert rec["enforced"] is False
    assert rec["mode"] == "shadow"


def test_enforce_critical_only_splits_critical_from_high(engine):
    crit = make_policy(
        Rule("c", "safety_score < 40", "x", Action.BLOCK, Severity.CRITICAL),
        default_action=Action.ALLOW, policy_id="pol_crit",
    )
    high = make_policy(
        Rule("h", "safety_score < 40", "x", Action.BLOCK, Severity.HIGH),
        default_action=Action.ALLOW, policy_id="pol_high",
    )
    signals = ctx(safety_score=10.0, safety_evaluated=True)

    dc = engine.simulate(crit, signals, EnforcementMode.ENFORCE_CRITICAL_ONLY)
    dh = engine.simulate(high, signals, EnforcementMode.ENFORCE_CRITICAL_ONLY)

    assert dc.decided_severity == Severity.CRITICAL and dc.enforced is True
    assert dh.decided_severity == Severity.HIGH and dh.enforced is False  # shadowed


def test_enforce_mode_gates_block_and_escalate(engine):
    policy = make_policy(
        Rule("e", "safety_score < 40", "x", Action.ESCALATE, Severity.HIGH),
        default_action=Action.ALLOW,
    )
    d = engine.simulate(policy, ctx(safety_score=10.0, safety_evaluated=True),
                        EnforcementMode.ENFORCE)
    assert d.decided_action == Action.ESCALATE and d.enforced is True


def test_enforce_mode_does_not_gate_nonruntime_verbs(engine):
    """mask/rewrite/etc. have no response-path runtime yet → enforced stays false,
    honestly recording intent without implying enforcement that didn't occur."""
    policy = make_policy(
        Rule("m", "safety_score < 40", "x", Action.MASK, Severity.HIGH),
        default_action=Action.ALLOW,
    )
    d = engine.simulate(policy, ctx(safety_score=10.0, safety_evaluated=True),
                        EnforcementMode.ENFORCE)
    assert d.decided_action == Action.MASK and d.enforced is False


@pytest.mark.parametrize("mode", list(EnforcementMode))
def test_every_record_carries_decided_action_enforced_and_mode(engine, sink, mode):
    policy = make_policy(
        Rule("r", "safety_score < 40", "x", Action.BLOCK, Severity.CRITICAL),
        default_action=Action.ALLOW,
    )
    engine.decide(policy, ctx(safety_score=10.0, safety_evaluated=True), mode)
    rec = sink.records[-1]
    assert "decided_action" in rec and "enforced" in rec and "mode" in rec
    # Consistency: shadow never enforces; if enforced, the mode is an enforcing one.
    if rec["mode"] == "shadow":
        assert rec["enforced"] is False
    if rec["enforced"]:
        assert rec["mode"] in ("enforce", "enforce_critical_only")


# ═══════════════════════════════════════════════════════════════════════════════
#  condition-language behaviors (membership, short-circuit guarding)
# ═══════════════════════════════════════════════════════════════════════════════


def test_in_membership_both_directions(engine):
    policy = make_policy(
        Rule("region", "region in ['EU', 'UK']", "x", Action.DISCLAIMER, Severity.LOW),
        Rule("pii", "'pii' in data_categories", "x", Action.MASK, Severity.MEDIUM),
        default_action=Action.ALLOW,
    )
    d = engine.simulate(policy, ctx(region="EU", data_categories=["pii", "phi"]))
    # MEDIUM mask outranks LOW disclaimer on severity.
    assert d.winning_rule_id == "pii"


def test_short_circuit_guards_missing_signal(engine):
    # bias not evaluated; the guard short-circuits before bias_score is read.
    policy = make_policy(
        Rule("guarded", "bias_evaluated == False or bias_score < 40", "x",
             Action.ESCALATE, Severity.MEDIUM, fail_mode=FailMode.FAIL_CLOSED),
        default_action=Action.ALLOW,
    )
    d = engine.simulate(policy, ctx(bias_evaluated=False))
    won = [re for re in d.rule_evaluations if re.rule_id == "guarded"][0]
    assert won.matched is True and won.errored is False  # guard worked, no error


# ═══════════════════════════════════════════════════════════════════════════════
#  performance — typical policy evaluates sub-millisecond
# ═══════════════════════════════════════════════════════════════════════════════


def test_typical_policy_evaluates_sub_millisecond(engine):
    rules = tuple(
        Rule(f"r{i}", f"safety_score < {i}", "x", Action.BLOCK, Severity.HIGH)
        for i in range(1, 13)
    )
    policy = make_policy(*rules, default_action=Action.ALLOW)
    signals = ctx(safety_score=50.0, safety_evaluated=True)
    engine.load_policy(policy)  # warm the compile cache

    timings = []
    for _ in range(2000):
        t0 = time.perf_counter()
        engine.simulate(policy, signals)
        timings.append(time.perf_counter() - t0)

    timings.sort()
    median = timings[len(timings) // 2]
    assert median < 1e-3, f"median {median*1e6:.1f}µs exceeds 1ms budget"


# ═══════════════════════════════════════════════════════════════════════════════
#  migration 009 is additive and was NOT auto-applied
# ═══════════════════════════════════════════════════════════════════════════════


def test_009_migration_is_additive_and_unapplied():
    repo = Path(__file__).resolve().parents[3]
    mig = repo / "backend" / "connectors" / "migrations" / "009_policy_engine.sql"
    assert mig.exists(), "009 migration file must exist"
    text = mig.read_text(encoding="utf-8")
    assert "NOT YET APPLIED" in text
    # No destructive statements in executable (non-comment) lines.
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("--"):
            continue
        upper = stripped.upper()
        assert "DROP TABLE" not in upper
        assert "DELETE FROM" not in upper
        assert "TRUNCATE" not in upper


def test_009_not_referenced_by_makefile_migrate():
    """The Makefile db-migrate target must not auto-apply 009 (it globs auth only)."""
    repo = Path(__file__).resolve().parents[3]
    makefile = (repo / "Makefile").read_text(encoding="utf-8")
    # db-migrate iterates backend/auth/migrations/*.sql — never connectors/009.
    assert "backend/connectors/migrations/009" not in makefile


# ═══════════════════════════════════════════════════════════════════════════════
#  decoupling — the engine never touches protected layers
# ═══════════════════════════════════════════════════════════════════════════════


def test_policy_package_does_not_import_protected_layers():
    """The engine consumes pillar *outputs*; it never imports the scoring path,
    the router, or auth middleware (Absolute Constraints). Checks actual import
    lines, not documentation mentions."""
    pkg = Path(__file__).resolve().parents[1] / "src" / "policy"
    forbidden = ("route_inference", "verify_jwt", "compute_composite_trust_score")
    for py in pkg.glob("*.py"):
        for line in py.read_text(encoding="utf-8").splitlines():
            stripped = line.strip()
            if not (stripped.startswith("import ") or stripped.startswith("from ")):
                continue
            for token in forbidden:
                assert token not in stripped, f"{py.name} must not import {token}"
            assert "ai_safety_pillars" not in stripped, f"{py.name} must not import pillar scoring"
