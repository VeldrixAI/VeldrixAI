"""Domain 3.5 — Service Perimeter (auth + default-safe logic, DB-free).
[OWASP API Security Top 10 — API2 Broken Auth, API5 BFLA, crown jewels #1/#3]

Attacks the two highest-stakes perimeter guarantees that are unit-testable without a
DB:
  1. INTERNAL_SERVICE_TOKEN fail-safe: unset → 503 (disabled), empty/wrong → 401.
     Enforcement gating can NEVER be flipped by an unauthenticated caller, and an
     UNSET token must fail *safe* (disabled), not *open*.  (policy_controller.py:26-39)
  2. Default-safe invariant: no sequence of mode changes can land a new/unconfigured
     tenant in anything but shadow; enforcement is always explicit opt-in.
     (mode_service.py:61-78)

The HTTP-surface attacks (BOLA on /detail, unauth GET disclosure) need the app + DB and
live in test_perimeter_http.py against ephemeral Postgres.
"""

from __future__ import annotations

import uuid

import pytest
from fastapi import HTTPException

from src.modules.policy import mode_service
from src.modules.policy.mode_service import ModeChangeError
from src.modules.policy.models import PolicyActiveBinding
from src.modules.policy.policy_controller import require_internal_token

TENANT = str(uuid.uuid4())
POLICY = "pol_default"


# ── 1. INTERNAL_SERVICE_TOKEN fail-safe (crown jewel #1) ───────────────────────

def test_unset_token_disables_mode_change_503_not_open(monkeypatch):
    """No token configured → 503 (disabled). MUST NOT be treated as 'no auth required'."""
    monkeypatch.delenv("INTERNAL_SERVICE_TOKEN", raising=False)
    with pytest.raises(HTTPException) as exc:
        require_internal_token(x_internal_token=None)
    assert exc.value.status_code == 503


def test_unset_token_rejects_even_a_supplied_token(monkeypatch):
    """Even if the caller supplies a token, an unconfigured server stays disabled
    (cannot be coerced open by guessing)."""
    monkeypatch.delenv("INTERNAL_SERVICE_TOKEN", raising=False)
    with pytest.raises(HTTPException) as exc:
        require_internal_token(x_internal_token="anything")
    assert exc.value.status_code == 503


def test_empty_string_token_is_treated_as_unset(monkeypatch):
    monkeypatch.setenv("INTERNAL_SERVICE_TOKEN", "")
    with pytest.raises(HTTPException) as exc:
        require_internal_token(x_internal_token="")
    assert exc.value.status_code == 503  # `not expected` → disabled


def test_wrong_token_is_401(monkeypatch):
    monkeypatch.setenv("INTERNAL_SERVICE_TOKEN", "s3cret")
    for bad in [None, "", "wrong", "S3CRET", "s3cret ", " s3cret"]:
        with pytest.raises(HTTPException) as exc:
            require_internal_token(x_internal_token=bad)
        assert exc.value.status_code in (401, 503)
        # a non-empty configured token + wrong value → 401 specifically
        if bad not in (None, ""):
            assert exc.value.status_code == 401


def test_correct_token_is_accepted(monkeypatch):
    """Control: the right token passes (so the gate isn't vacuously closed)."""
    monkeypatch.setenv("INTERNAL_SERVICE_TOKEN", "s3cret")
    assert require_internal_token(x_internal_token="s3cret") is None


# ── 2. Default-safe invariant under hostile sequences (crown jewel #3) ─────────

class _FakeQuery:
    def __init__(self, rows):
        self._rows, self._f = rows, {}

    def filter_by(self, **kw):
        self._f = kw
        return self

    def first(self):
        for r in self._rows:
            if all(getattr(r, k) == v for k, v in self._f.items()):
                return r
        return None


class _FakeSession:
    def __init__(self, bindings=None):
        self.bindings = list(bindings or [])
        self.added = []

    def query(self, _model):
        return _FakeQuery(self.bindings)

    def add(self, obj):
        self.added.append(obj)
        if isinstance(obj, PolicyActiveBinding):
            self.bindings.append(obj)

    def commit(self):
        pass


@pytest.fixture
def captured(monkeypatch):
    rows = []
    monkeypatch.setattr(mode_service, "_chain_insert",
                        lambda db, entry: rows.append(entry) or entry)
    return rows


@pytest.mark.parametrize("hostile_first_mode", ["enforce", "enforce_critical_only"])
def test_new_tenant_cannot_be_created_in_any_enforce_mode(captured, hostile_first_mode):
    db = _FakeSession()  # no binding → unconfigured tenant
    with pytest.raises(ModeChangeError):
        mode_service.change_mode(db, tenant_id=TENANT, policy_id=POLICY,
                                 new_mode=hostile_first_mode, actor="attacker")
    assert captured == [] and db.added == []   # nothing persisted, nothing audited


def test_no_audit_record_written_on_rejected_change(captured):
    """A rejected (unsafe) change must not leave a partial/forged audit row."""
    db = _FakeSession()
    with pytest.raises(ModeChangeError):
        mode_service.change_mode(db, tenant_id=TENANT, policy_id=POLICY,
                                 new_mode="enforce", actor="x")
    assert captured == []


def test_unknown_mode_string_rejected(captured):
    db = _FakeSession([PolicyActiveBinding(tenant_id=TENANT, policy_id=POLICY,
                                           policy_enforcement_mode="shadow")])
    for bad in ["ENFORCE", "enforce ", "yolo", "enforce_all", "", "shadow​"]:
        with pytest.raises(ModeChangeError):
            mode_service.change_mode(db, tenant_id=TENANT, policy_id=POLICY,
                                     new_mode=bad, actor="x")


def test_every_accepted_change_is_audited(captured):
    """Crown jewel: a mode change can NEVER occur without its who/when/from→to record."""
    existing = PolicyActiveBinding(tenant_id=TENANT, policy_id=POLICY,
                                   policy_enforcement_mode="shadow")
    db = _FakeSession([existing])
    mode_service.change_mode(db, tenant_id=TENANT, policy_id=POLICY,
                             new_mode="enforce_critical_only", actor="alice@veldrix")
    assert len(captured) == 1
    rec = captured[0]
    assert rec.action_type == mode_service.ACTION_CHANGE
    assert rec.action_metadata["from_mode"] == "shadow"
    assert rec.action_metadata["to_mode"] == "enforce_critical_only"
    assert rec.action_metadata["actor"] == "alice@veldrix"
    assert "changed_at" in rec.action_metadata


def test_staged_then_rollback_is_each_audited(captured):
    existing = PolicyActiveBinding(tenant_id=TENANT, policy_id=POLICY,
                                   policy_enforcement_mode="shadow")
    db = _FakeSession([existing])
    mode_service.change_mode(db, tenant_id=TENANT, policy_id=POLICY,
                             new_mode="enforce", actor="ops")
    mode_service.rollback_to_shadow(db, tenant_id=TENANT, policy_id=POLICY, actor="oncall")
    assert [r.action_type for r in captured] == [
        mode_service.ACTION_CHANGE, mode_service.ACTION_ROLLBACK
    ]
    assert existing.policy_enforcement_mode == "shadow"   # de-gated
