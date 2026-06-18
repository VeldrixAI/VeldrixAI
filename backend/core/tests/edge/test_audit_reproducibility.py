"""Edge battery — decision-record reproducibility under adversarial-but-valid payloads.

Phase-1 guarantee, stress-tested: a decision must reproduce offline from
(policy version + signal snapshot) alone, and the audit metadata must be JSON-round-
trippable. We feed crafted-but-valid contexts (unicode/RTL/emoji strings, large
``data_categories`` lists, boundary + non-finite numerics, tuple inputs) and assert:

  1. simulate() is deterministic (same inputs → identical signature).
  2. The signal_snapshot survives a JSON round-trip unchanged.
  3. Rebuilding a context from the snapshot and re-simulating reproduces the SAME
     decision signature (offline reproducibility).
  4. The full to_audit_metadata() is JSON-serializable.
  5. Distinct adversarial contexts yield distinct decision signatures (no collapse).

All HELD.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

import pytest

from src.policy.context import SignalContext
from src.policy.engine import PolicyEngine
from src.policy.schema import Action, EnforcementMode, Policy, Rule, Severity

NOW = datetime(2026, 1, 1, tzinfo=timezone.utc)


def _engine():
    return PolicyEngine(audit_sink=lambda rec: None)


def _policy():
    rules = (
        Rule(id="r_block", condition="safety_score < 40", description="b",
             action=Action.BLOCK, severity=Severity.CRITICAL),
        Rule(id="r_region", condition='region == "EU"', description="r",
             action=Action.ESCALATE, severity=Severity.HIGH),
        Rule(id="r_cat", condition='"pii" in data_categories', description="c",
             action=Action.MASK, severity=Severity.MEDIUM),
    )
    return Policy(policy_id="repro", version=3, created_by="qa", created_at=NOW,
                 effective_at=NOW, default_action=Action.ALLOW, rules=rules)


ADVERSARIAL_CONTEXTS = [
    {"safety_score": 39.999999999, "safety_evaluated": True, "region": "EU",
     "data_categories": ["pii", "phi"]},
    {"safety_score": 95, "safety_evaluated": True, "region": "E‮U",  # RTL override
     "data_categories": ["\U0001F600", "pii"]},
    {"safety_score": float("nan"), "safety_evaluated": True,         # normalized → None
     "region": "café", "data_categories": []},
    {"safety_score": 100, "safety_evaluated": True, "region": "US",
     "data_categories": ["a" * 500, "pii"]},
    {"safety_score": -0.0, "safety_evaluated": True, "region": "",
     "data_categories": tuple(["pii"])},                             # tuple input
]


@pytest.mark.parametrize("values", ADVERSARIAL_CONTEXTS)
def test_decision_is_deterministic(values):
    ctx = SignalContext(values=dict(values))
    d1 = _engine().simulate(_policy(), ctx, EnforcementMode.ENFORCE, request_id="x")
    d2 = _engine().simulate(_policy(), ctx, EnforcementMode.ENFORCE, request_id="y")
    assert d1.signature() == d2.signature()         # volatile-free signature is stable


@pytest.mark.parametrize("values", ADVERSARIAL_CONTEXTS)
def test_snapshot_json_roundtrips(values):
    ctx = SignalContext(values=dict(values))
    d = _engine().simulate(_policy(), ctx, EnforcementMode.ENFORCE)
    blob = json.dumps(d.signal_snapshot, sort_keys=True, separators=(",", ":"))
    restored = json.loads(blob)
    assert restored == d.signal_snapshot            # no lossy / non-JSON content


@pytest.mark.parametrize("values", ADVERSARIAL_CONTEXTS)
def test_offline_reproduction_from_snapshot(values):
    """Rebuild a context from ONLY the persisted snapshot and re-run: the decision
    signature must match — i.e. the record reproduces from (policy + snapshot)."""
    eng = _engine()
    pol = _policy()
    ctx = SignalContext(values=dict(values))
    original = eng.simulate(pol, ctx, EnforcementMode.ENFORCE)

    # Persist + reload the snapshot exactly as the audit layer would.
    snap = json.loads(json.dumps(original.signal_snapshot))
    rebuilt_ctx = SignalContext(values=snap)
    reproduced = eng.simulate(pol, rebuilt_ctx, EnforcementMode.ENFORCE)

    assert reproduced.signature() == original.signature()


@pytest.mark.parametrize("values", ADVERSARIAL_CONTEXTS)
def test_full_audit_metadata_is_json_serializable(values):
    ctx = SignalContext(values=dict(values))
    d = _engine().simulate(_policy(), ctx, EnforcementMode.ENFORCE, request_id="rid", tenant_id="t1")
    meta = d.to_audit_metadata()
    # Must serialize without a default= fallback (parity with the audit hash recipe).
    json.dumps(meta, sort_keys=True, separators=(",", ":"))


def test_distinct_contexts_yield_distinct_signatures():
    eng, pol = _engine(), _policy()
    sigs = set()
    for values in ADVERSARIAL_CONTEXTS:
        d = eng.simulate(pol, SignalContext(values=dict(values)), EnforcementMode.ENFORCE)
        sigs.add(json.dumps(d.signature(), sort_keys=True))
    # The five crafted contexts drive materially different decisions/snapshots.
    assert len(sigs) == len(ADVERSARIAL_CONTEXTS)
