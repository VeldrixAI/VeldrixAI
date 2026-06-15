"""Unit tests for the audit-trail hash chain (Phase 2 / Part A).

Pure unit tests — no DB. They pin the canonical serializer byte-for-byte against
a re-derivation of the core Policy Engine recipe (recon N1), assert the chain's
genesis/linking behaviour, and prove that any tampering — including a deleted
link — is detectable by :func:`verify_chain`.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime

from src.modules.analytics.audit_hash import (
    GENESIS_HASH,
    SYSTEM_TENANT_ID,
    canonical_json,
    compute_record_hash,
    tenant_key,
    verify_chain,
)


# ── Canonical serializer parity (N1) ─────────────────────────────────────────

def _core_recipe(obj) -> str:
    """Re-derivation of backend/core/src/policy/schema.py::_compute_checksum."""
    blob = json.dumps(obj, sort_keys=True, separators=(",", ":"))
    return "sha256:" + hashlib.sha256(blob.encode("utf-8")).hexdigest()


def test_canonical_json_is_sorted_and_compact():
    assert canonical_json({"b": 1, "a": 2}) == '{"a":2,"b":1}'
    # Nested ordering is stable too.
    assert canonical_json({"z": {"y": 1, "x": 2}}) == '{"z":{"x":2,"y":1}}'


def test_canonical_json_byte_for_byte_parity_with_core():
    sample = {"policy_id": "p1", "version": 3, "rules": [{"b": 2, "a": 1}]}
    # The connectors serializer must produce exactly what core hashes.
    assert (
        "sha256:" + hashlib.sha256(canonical_json(sample).encode()).hexdigest()
        == _core_recipe(sample)
    )


def test_record_hash_pins_known_vector():
    """Lock the preimage format so neither service can silently drift."""
    h = compute_record_hash(
        prev_hash=GENESIS_HASH,
        action_type="trust_evaluation",
        entity_type=None,
        entity_id=None,
        user_id=None,
        request_id="req-1",
        created_at=datetime(2026, 1, 1, 0, 0, 0),
        action_metadata={"verdict": "ALLOW"},
    )
    ident = {
        "action_type": "trust_evaluation",
        "entity_type": None,
        "entity_id": None,
        "user_id": None,
        "request_id": "req-1",
        "created_at": "2026-01-01T00:00:00",
        "action_metadata": {"verdict": "ALLOW"},
    }
    expected = "sha256:" + hashlib.sha256(
        (canonical_json(ident) + "\n" + GENESIS_HASH).encode()
    ).hexdigest()
    assert h == expected


# ── Sentinels & tenant keying ────────────────────────────────────────────────

def test_genesis_sentinel_shape():
    assert GENESIS_HASH == "sha256:" + "0" * 64


def test_tenant_key_falls_back_to_system_for_null():
    assert tenant_key(None) == SYSTEM_TENANT_ID
    assert tenant_key("11111111-1111-1111-1111-111111111111") == \
        "11111111-1111-1111-1111-111111111111"


# ── Chain construction & verification ────────────────────────────────────────

def _row(seq, prev, meta, *, user_id=None, action_type="trust_evaluation",
         request_id=None, created_at=None):
    rh = compute_record_hash(
        prev_hash=prev,
        action_type=action_type,
        entity_type=None,
        entity_id=None,
        user_id=user_id,
        request_id=request_id,
        created_at=created_at or datetime(2026, 1, 1, 0, seq, 0),
        action_metadata=meta,
    )
    return {
        "chain_seq": seq,
        "prev_hash": prev,
        "record_hash": rh,
        "action_type": action_type,
        "entity_type": None,
        "entity_id": None,
        "user_id": user_id,
        "request_id": request_id,
        "created_at": created_at or datetime(2026, 1, 1, 0, seq, 0),
        "action_metadata": meta,
    }


def _build_chain(metas: list[dict]) -> list[dict]:
    rows, prev = [], GENESIS_HASH
    for i, m in enumerate(metas):
        r = _row(i, prev, m)
        rows.append(r)
        prev = r["record_hash"]
    return rows


def test_intact_chain_verifies():
    chain = _build_chain([{"verdict": "ALLOW"}, {"verdict": "BLOCK"}, {"verdict": "WARN"}])
    assert verify_chain(chain) is None


def test_first_record_links_to_genesis():
    chain = _build_chain([{"verdict": "ALLOW"}])
    assert chain[0]["prev_hash"] == GENESIS_HASH


def test_tampered_metadata_is_detected():
    chain = _build_chain([{"verdict": "ALLOW"}, {"verdict": "BLOCK"}])
    # Attacker edits a stored payload in place but can't recompute the chain.
    chain[0]["action_metadata"] = {"verdict": "BLOCK"}  # was ALLOW
    result = verify_chain(chain)
    assert result is not None and "tampered" in result


def test_deleted_link_breaks_chain():
    chain = _build_chain([{"v": 1}, {"v": 2}, {"v": 3}])
    # Remove the middle record — the third's prev_hash no longer matches.
    broken = [chain[0], chain[2]]
    result = verify_chain(broken)
    assert result is not None and "chain break" in result


def test_reordered_records_break_chain():
    chain = _build_chain([{"v": 1}, {"v": 2}])
    result = verify_chain(list(reversed(chain)))
    assert result is not None
