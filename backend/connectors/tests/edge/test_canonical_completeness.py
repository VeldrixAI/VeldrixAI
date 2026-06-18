"""Edge battery — canonical-serialization completeness AFTER the F-CANON-1 fix.

Re-runs collision attempts across the full JSON-native type space (must stay distinct)
and the newly-rejecting non-JSON-native space (must raise, in parity with core) to
confirm no residual collision class was introduced or left behind by dropping
``default=str``.

One residual class remains and is recorded report-only (EF-CANON-KEYS-1): JSON coerces
non-string dict KEYS to strings, so ``{1: "a"}`` and ``{"1": "a"}`` still share a
canonical form. This is inherent to ``json.dumps`` key handling (not ``default=str``)
and is NOT reachable via the JSON-over-HTTP audit ingress (where keys are always
strings) — same reachability caveat as F-CANON-1.
"""

from __future__ import annotations

import json
from decimal import Decimal

import pytest

from src.modules.analytics.audit_hash import canonical_json


def _core_recipe(obj) -> str:
    """Re-derivation of core schema.py::_compute_checksum (no default=)."""
    return json.dumps(obj, sort_keys=True, separators=(",", ":"))


# ── 1. JSON-native type space: every distinct value → distinct canonical form ──

@pytest.mark.parametrize("a,b", [
    ({"x": 1}, {"x": 1.0}),          # int vs float
    ({"x": 1}, {"x": "1"}),          # int vs string
    ({"x": 1.0}, {"x": "1.0"}),      # float vs string
    ({"x": True}, {"x": 1}),         # bool vs int
    ({"x": False}, {"x": 0}),        # bool vs int
    ({"x": True}, {"x": "true"}),    # bool vs string
    ({"x": None}, {"x": "null"}),    # null vs string
    ({"x": None}, {"x": ""}),        # null vs empty string
    ({"x": [1]}, {"x": "1"}),        # list vs string
    ({"x": [1, 2]}, {"x": [2, 1]}),  # list order is significant
    ({"x": {"a": 1}}, {"x": "a"}),   # dict vs string
])
def test_json_native_values_do_not_collide(a, b):
    assert canonical_json(a) != canonical_json(b)


def test_json_native_parity_with_core_holds():
    sample = {"p": "x", "v": 3, "rules": [{"b": 2, "a": 1}], "n": 1.5, "ok": True, "z": None}
    assert canonical_json(sample) == _core_recipe(sample)


def test_key_order_is_canonicalized_not_a_collision():
    assert canonical_json({"a": 1, "b": 2}) == canonical_json({"b": 2, "a": 1})


# ── 2. Non-JSON-native space now RAISES (parity with core — both refuse) ────────

class _Custom:
    pass


@pytest.mark.parametrize("obj", [
    {"x": Decimal("1.0")},
    {"x": {1, 2, 3}},                # set
    {"x": b"bytes"},                 # bytes
    {"x": _Custom()},                # arbitrary object
    {"x": complex(1, 2)},            # complex
    {"x": frozenset([1])},           # frozenset
])
def test_non_json_native_raises_in_parity_with_core(obj):
    with pytest.raises(TypeError):
        canonical_json(obj)
    with pytest.raises(TypeError):
        _core_recipe(obj)


# ── 3. bool/int/float KEY handling — distinctness where it exists ──────────────

def test_bool_and_int_keys_do_not_collide():
    # True → "true", 1 → "1": distinct canonical forms.
    assert canonical_json({True: "a"}) != canonical_json({1: "a"})


# ── 4. Residual collision class: non-string keys coerced to strings (PROBE) ────

def test_int_key_collides_with_string_key_PROBE():
    """PROBE (report-only, EF-CANON-KEYS-1): json coerces an int key to its string
    form, so these distinct dicts share a canonical form. Latent — unreachable via the
    JSON ingress (keys arrive as strings). Documents the residual class post-F-CANON-1."""
    assert canonical_json({1: "a"}) == canonical_json({"1": "a"}) == '{"1":"a"}'


def test_float_key_collides_with_string_key_PROBE():
    """Same residual class for a float key."""
    assert canonical_json({1.5: "a"}) == canonical_json({"1.5": "a"}) == '{"1.5":"a"}'
