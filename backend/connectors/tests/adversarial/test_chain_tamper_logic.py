"""Domain 3.4 — Audit Chain Tamper-Evidence: verify_chain attack matrix (DB-free).
[NIST AI RMF MANAGE / integrity]

Guarantee (audit_hash.py:6-8, :105-135): any after-the-fact edit — including a single
byte, a deleted link, a mid-chain splice, or cross-tenant confusion — breaks the chain
and is detected by verify_chain(). These are the cryptographic-logic attacks; the
DB-level append-only trigger is attacked separately against ephemeral Postgres in
test_audit_trigger_dblevel.py.

PASS = tamper detected (guarantee held).
"""

from __future__ import annotations

from datetime import datetime

import pytest

from src.modules.analytics.audit_hash import (
    GENESIS_HASH,
    compute_record_hash,
    verify_chain,
)


def _row(seq, prev, meta, *, user_id=None, action_type="policy_decision",
         request_id=None, created_at=None):
    ca = created_at or datetime(2026, 1, 1, 0, seq, 0)
    rh = compute_record_hash(
        prev_hash=prev, action_type=action_type, entity_type=None, entity_id=None,
        user_id=user_id, request_id=request_id, created_at=ca, action_metadata=meta,
    )
    return {
        "chain_seq": seq, "prev_hash": prev, "record_hash": rh,
        "action_type": action_type, "entity_type": None, "entity_id": None,
        "user_id": user_id, "request_id": request_id, "created_at": ca,
        "action_metadata": meta,
    }


def _chain(metas, user_id=None):
    rows, prev = [], GENESIS_HASH
    for i, m in enumerate(metas):
        r = _row(i, prev, m, user_id=user_id)
        rows.append(r)
        prev = r["record_hash"]
    return rows


# ── 1. Single-byte alteration is detected ──────────────────────────────────────

def test_single_byte_metadata_edit_detected():
    chain = _chain([{"decided_action": "allow"}, {"decided_action": "block"}])
    # Flip one character in a stored decision: allow -> bllow.
    chain[0]["action_metadata"] = {"decided_action": "bllow"}
    res = verify_chain(chain)
    assert res is not None and "tampered" in res


def test_flip_enforced_flag_detected():
    """An attacker who flips enforced:true→false to hide a gate must break the hash."""
    chain = _chain([{"decided_action": "block", "enforced": True}])
    chain[0]["action_metadata"] = {"decided_action": "block", "enforced": False}
    assert verify_chain(chain) is not None


# ── 2. Deletion / splice / reorder detected ────────────────────────────────────

def test_deleted_middle_link_detected():
    chain = _chain([{"v": 1}, {"v": 2}, {"v": 3}])
    spliced = [chain[0], chain[2]]               # remove the middle
    res = verify_chain(spliced)
    assert res is not None and "chain break" in res


def test_inserted_forged_row_detected():
    """Forge a row with a VALID self-hash but wrong prev linkage, splice it mid-chain."""
    chain = _chain([{"v": 1}, {"v": 2}])
    forged = _row(1, chain[0]["record_hash"], {"v": "evil"})  # self-consistent
    spliced = [chain[0], forged, chain[1]]       # chain[1].prev no longer matches forged
    res = verify_chain(spliced)
    assert res is not None  # break or tamper at the join


def test_reordered_records_detected():
    chain = _chain([{"v": 1}, {"v": 2}, {"v": 3}])
    assert verify_chain([chain[0], chain[2], chain[1]]) is not None


# ── 3. Cross-tenant chain confusion detected ───────────────────────────────────

def test_cross_tenant_record_reuse_detected():
    """A row whose record_hash was computed for tenant A cannot be presented as a
    tenant-B row: user_id is inside the hashed identity (audit_hash.py:75-83), so the
    recompute under B's user_id will not match the stored hash."""
    A = "11111111-1111-1111-1111-111111111111"
    B = "22222222-2222-2222-2222-222222222222"
    a_chain = _chain([{"v": 1}], user_id=A)
    stolen = dict(a_chain[0])
    stolen["user_id"] = B            # claim A's record belongs to B, keep A's record_hash
    res = verify_chain([stolen])
    assert res is not None and "tampered" in res


def test_genesis_prev_hash_forgery_detected():
    """A row claiming genesis linkage but carrying a non-genesis-derived hash is caught."""
    A = "33333333-3333-3333-3333-333333333333"
    chain = _chain([{"v": 1}, {"v": 2}], user_id=A)
    # Take the 2nd row (prev = row0.hash) but relabel it as the head (prev=genesis).
    head_forge = dict(chain[1])
    head_forge["prev_hash"] = GENESIS_HASH
    head_forge["chain_seq"] = 0
    assert verify_chain([head_forge]) is not None


# ── 4. Intact chain still verifies (control) ───────────────────────────────────

def test_intact_chain_verifies_clean():
    chain = _chain([{"v": 1}, {"v": 2}, {"v": 3}])
    assert verify_chain(chain) is None
