"""Enforcement-mode rollout tooling — audited, default-safe, reversible (Part B / B.3).

Maps to the §5 Part-B checklist: mode-change writes its own audit record (who/when/
from→to); a new/unconfigured tenant cannot be set to anything but shadow; rollback is
immediate + audited; the pre-flight blast-radius report is correct against a fixture.

DB-free: the binding store is a tiny fake session and the Part A chain-insert is
patched to capture the audit row, so the rollout *logic + audit contract* are tested
without a Postgres instance.
"""

from __future__ import annotations

import uuid

import pytest

from src.modules.policy import mode_service
from src.modules.policy.mode_service import ModeChangeError
from src.modules.policy.models import PolicyActiveBinding

TENANT = str(uuid.uuid4())
POLICY = "pol_default"


# ── fake session (just enough for change_mode / get_mode) ────────────────────────

class FakeQuery:
    def __init__(self, rows):
        self._rows = rows
        self._filt = {}

    def filter_by(self, **kw):
        self._filt = kw
        return self

    def first(self):
        for r in self._rows:
            if all(getattr(r, k) == v for k, v in self._filt.items()):
                return r
        return None


class FakeSession:
    def __init__(self, bindings=None):
        self.bindings = list(bindings or [])
        self.added = []

    def query(self, model):
        return FakeQuery(self.bindings)

    def add(self, obj):
        self.added.append(obj)
        if isinstance(obj, PolicyActiveBinding):
            self.bindings.append(obj)

    def commit(self):
        pass


@pytest.fixture
def captured(monkeypatch):
    """Capture every audit row the service would chain-append."""
    rows = []
    monkeypatch.setattr(mode_service, "_chain_insert", lambda db, entry: rows.append(entry) or entry)
    return rows


# ── default-safe invariant (pure) ────────────────────────────────────────────────

def test_validate_transition_new_tenant_must_be_shadow():
    mode_service.validate_transition(None, "shadow")  # ok
    for bad in ("enforce", "enforce_critical_only"):
        with pytest.raises(ModeChangeError):
            mode_service.validate_transition(None, bad)


def test_validate_transition_staged_path_allowed():
    mode_service.validate_transition("shadow", "enforce_critical_only")
    mode_service.validate_transition("enforce_critical_only", "enforce")
    mode_service.validate_transition("enforce", "shadow")  # rollback


def test_validate_transition_rejects_unknown_mode():
    with pytest.raises(ModeChangeError):
        mode_service.validate_transition("shadow", "yolo")


# ── change_mode writes an audited who/when/from→to record ─────────────────────────

def test_new_tenant_to_enforce_is_blocked(captured):
    db = FakeSession()
    with pytest.raises(ModeChangeError):
        mode_service.change_mode(db, tenant_id=TENANT, policy_id=POLICY,
                                 new_mode="enforce", actor="ops@veldrix")
    assert captured == []          # nothing written on a rejected change
    assert db.added == []


def test_change_mode_records_who_when_from_to(captured):
    # Tenant already opted in as shadow; now stage to enforce_critical_only.
    existing = PolicyActiveBinding(tenant_id=TENANT, policy_id=POLICY, policy_enforcement_mode="shadow")
    db = FakeSession([existing])

    res = mode_service.change_mode(
        db, tenant_id=TENANT, policy_id=POLICY,
        new_mode="enforce_critical_only", actor="alice@veldrix", reason="staged rollout",
    )
    assert res["from_mode"] == "shadow" and res["to_mode"] == "enforce_critical_only"
    assert existing.policy_enforcement_mode == "enforce_critical_only"  # binding updated

    assert len(captured) == 1
    rec = captured[0]
    assert rec.action_type == mode_service.ACTION_CHANGE
    assert rec.actor == "alice@veldrix"
    assert str(rec.user_id) == TENANT                      # lands in the tenant's chain
    meta = rec.action_metadata
    assert meta["from_mode"] == "shadow" and meta["to_mode"] == "enforce_critical_only"
    assert meta["actor"] == "alice@veldrix" and meta["reason"] == "staged rollout"
    assert "changed_at" in meta and meta["is_rollback"] is False


def test_rollback_is_immediate_and_audited(captured):
    existing = PolicyActiveBinding(tenant_id=TENANT, policy_id=POLICY, policy_enforcement_mode="enforce")
    db = FakeSession([existing])

    res = mode_service.rollback_to_shadow(db, tenant_id=TENANT, policy_id=POLICY, actor="oncall@veldrix")
    assert res["to_mode"] == "shadow" and res["is_rollback"] is True
    assert existing.policy_enforcement_mode == "shadow"     # de-gated in place, no migration
    rec = captured[0]
    assert rec.action_type == mode_service.ACTION_ROLLBACK
    assert rec.action_metadata["from_mode"] == "enforce" and rec.action_metadata["to_mode"] == "shadow"


def test_get_mode_defaults_to_shadow():
    assert mode_service.get_mode(FakeSession(), TENANT, POLICY) == "shadow"
    db = FakeSession([PolicyActiveBinding(tenant_id=TENANT, policy_id=POLICY, policy_enforcement_mode="enforce")])
    assert mode_service.get_mode(db, TENANT, POLICY) == "enforce"


# ── pre-flight blast-radius (pure) ───────────────────────────────────────────────

def test_compute_preflight_blast_radius():
    rows = [
        {"action": "allow", "severity": "low"},
        {"action": "block", "severity": "critical"},
        {"action": "block", "severity": "high"},
        {"action": "escalate", "severity": "critical"},
        {"action": "disclaimer", "severity": "low"},
    ]
    r = mode_service.compute_preflight(rows)
    assert r["total_decisions"] == 5
    assert r["would_gate"] == 3                 # 2 block + 1 escalate
    assert r["would_gate_critical"] == 2        # 1 block-critical + 1 escalate-critical
    assert r["would_gate_non_critical"] == 1
    assert r["by_action"]["block"] == 2 and r["by_action"]["allow"] == 1


def test_compute_preflight_empty_history():
    r = mode_service.compute_preflight([])
    assert r == {
        "total_decisions": 0, "would_gate": 0, "would_gate_critical": 0,
        "would_gate_non_critical": 0, "by_action": {},
    }
