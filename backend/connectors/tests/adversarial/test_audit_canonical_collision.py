"""Domain 3.4 — Audit Chain Tamper-Evidence: canonical-serialization attacks.
[NIST AI RMF MANAGE / integrity]  (§6 mandates this collision attempt be run + stated.)

Guarantee under test (audit_hash.py:9-22, :44-46): the connectors canonical
serializer is byte-for-byte identical to core's, and two DIFFERENT payloads cannot
produce the same canonical form (else tamper-evidence is defeated by a collision).

Result summary (asserted below):
  * Representation tricks (int vs float, bool vs int, key reorder) do NOT collide
    → guarantee HELD against the obvious attacks.
  * `default=str` (audit_hash.py:46 — present in connectors, ABSENT in core) enables
    a LATENT collision for non-JSON-native Python objects, AND breaks the claimed
    byte-for-byte parity with core (core RAISES on the same input). → Finding
    F-CANON-1 (latent; not reachable via the JSON ingress today — see SECURITY_FINDINGS).
"""

from __future__ import annotations

import json
from decimal import Decimal

import pytest

from src.modules.analytics.audit_hash import (
    GENESIS_HASH,
    canonical_json,
    compute_record_hash,
)


def _core_recipe(obj) -> str:
    """Re-derivation of core schema.py::_compute_checksum (NO default=str)."""
    return json.dumps(obj, sort_keys=True, separators=(",", ":"))


# ── 1. Representation tricks must NOT collide (guarantee held) ──────────────────

@pytest.mark.parametrize(
    "a,b",
    [
        ({"x": 1}, {"x": 1.0}),       # int vs float
        ({"x": True}, {"x": 1}),      # bool vs int
        ({"x": False}, {"x": 0}),     # bool vs int
        ({"x": 1}, {"x": "1"}),       # int vs string
    ],
)
def test_numeric_and_bool_representations_do_not_collide(a, b):
    assert canonical_json(a) != canonical_json(b)
    assert compute_record_hash(prev_hash=GENESIS_HASH, action_type="t", entity_type=None,
                               entity_id=None, user_id=None, request_id="r",
                               created_at="2026-01-01T00:00:00", action_metadata=a) != \
           compute_record_hash(prev_hash=GENESIS_HASH, action_type="t", entity_type=None,
                               entity_id=None, user_id=None, request_id="r",
                               created_at="2026-01-01T00:00:00", action_metadata=b)


def test_key_reordering_is_same_logical_object_not_a_distinct_payload():
    """Key order is not a collision of *different* payloads — sort_keys canonicalizes
    the SAME dict. Confirms order-independence (intended), not a tamper vector."""
    assert canonical_json({"a": 1, "b": 2}) == canonical_json({"b": 2, "a": 1})


# ── 2. default=str latent collision + broken parity with core (F-CANON-1) ──────

def test_default_str_enables_latent_collision_DEFEAT():
    """[HELD — Finding F-CANON-1 fixed] With `default=str` removed, the latent collision
    is gone: a non-JSON-native Decimal('1.0') now RAISES TypeError instead of being
    stringified to collide with the string '1.0'. The string payload still hashes
    normally and the two can no longer share a canonical form / record_hash.

    (Test name kept for report-traceability; the assertion flipped DEFEAT→HELD.)"""
    a = {"x": Decimal("1.0")}
    b = {"x": "1.0"}
    # The Decimal payload now raises rather than silently stringifying.
    with pytest.raises(TypeError):
        canonical_json(a)
    with pytest.raises(TypeError):
        compute_record_hash(prev_hash=GENESIS_HASH, action_type="t", entity_type=None,
                            entity_id=None, user_id=None, request_id="r",
                            created_at="2026-01-01T00:00:00", action_metadata=a)
    # The string payload still hashes; no collision is possible with a raising input.
    hb = compute_record_hash(prev_hash=GENESIS_HASH, action_type="t", entity_type=None,
                             entity_id=None, user_id=None, request_id="r",
                             created_at="2026-01-01T00:00:00", action_metadata=b)
    assert hb.startswith("sha256:")


def test_int_key_collides_with_string_key_under_default_str():
    """JSON coerces all keys to strings, so {1:'a'} and {'1':'a'} collide too (latent)."""
    assert canonical_json({1: "a"}) == canonical_json({"1": "a"}) == '{"1":"a"}'


def test_byte_for_byte_parity_with_core_is_FALSE_for_non_json_inputs_DEFEAT():
    """[HELD — Finding F-CANON-1 (parity) fixed] Byte-for-byte parity with core now
    holds even for non-JSON-native inputs: connectors no longer stringifies via
    default=str, so BOTH services raise TypeError on the same non-serializable object.
    They agree (by both refusing) rather than disagreeing.

    (Test name kept for report-traceability; the assertion flipped DEFEAT→HELD.)"""
    obj = {"x": Decimal("1.0")}
    # connectors: now raises (parity with core)
    with pytest.raises(TypeError):
        canonical_json(obj)
    # core: raises on the identical input
    with pytest.raises(TypeError):
        _core_recipe(obj)


def test_json_native_inputs_DO_have_parity_with_core():
    """Control: for the values that actually traverse the JSON audit ingress, parity
    holds — so the finding is correctly scoped as 'non-JSON-native only'."""
    sample = {"policy_id": "p1", "version": 3, "rules": [{"b": 2, "a": 1}], "n": 1.5}
    assert canonical_json(sample) == _core_recipe(sample)
