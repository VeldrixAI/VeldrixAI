"""Edge battery — Unicode & encoding in policy condition fields & string operands.

Extends the Phase-3 homoglyph probe: RTL overrides, zero-width chars, NFC/NFD, more
homoglyphs, surrogate/astral literals, and overlong inputs — across BOTH the field-name
surface (compile-time validation) and the string-operand surface (evaluation).

HELD where the allowlist/length guard refuses or where exact-match is the intended,
safe behavior. NFC/NFD operand-vs-value mismatch is recorded report-only
(EF-UNICODE-NFC-1) — no normalization is performed, which can make a string rule
silently not match its target.
"""

from __future__ import annotations

import pytest

from src.policy.evaluator import (
    ConditionCompileError,
    ConditionError,
    UnknownFieldError,
    compile_condition,
)


# ── Field-name surface: non-ASCII names must never resolve to a declared field ──

@pytest.mark.parametrize("payload", [
    "sаfety_score < 90",            # Cyrillic 'а' (U+0430) homoglyph
    "ѕafety_score < 90",            # Cyrillic 'ѕ' (U+0455) homoglyph
    "safety_score​ < 90",      # trailing zero-width space in the name
    "saf‍ety_score < 90",      # zero-width joiner inside the name
    "‮safety_score < 90",      # RTL override prefix
    "ＳＡＦＥＴＹ_score < 90",          # fullwidth letters
])
def test_unicode_field_names_are_rejected(payload):
    """Any Unicode look-alike / control-laden field name is rejected at compile time —
    it can never alias the ASCII declared field."""
    with pytest.raises(ConditionError):
        compile_condition(payload)


def test_homoglyph_name_is_specifically_unknown_field():
    with pytest.raises(UnknownFieldError):
        compile_condition("sаfety_score < 90")   # valid identifier, undeclared


# ── String-operand surface: literals compare EXACTLY (no accidental aliasing) ──

def test_zero_width_in_operand_does_not_alias_plain_value():
    cond = compile_condition('region == "EU​"')   # value with zero-width space
    assert cond.evaluate({"region": "EU"}) is False      # plain "EU" must NOT match
    assert cond.evaluate({"region": "EU​"}) is True # exact match only


def test_rtl_override_in_operand_is_literal():
    cond = compile_condition('action_class == "wire‮transfer"')
    assert cond.evaluate({"action_class": "wiretransfer"}) is False
    assert cond.evaluate({"action_class": "wire‮transfer"}) is True


def test_astral_surrogate_emoji_literal_compiles_and_matches_exactly():
    cond = compile_condition('region == "\U0001F600"')   # 😀 U+1F600 (astral)
    assert cond.evaluate({"region": "\U0001F600"}) is True
    assert cond.evaluate({"region": "EU"}) is False


def test_homoglyph_operand_does_not_match_ascii_value():
    cond = compile_condition('region == "EU"')
    assert cond.evaluate({"region": "ЕU"}) is False       # Cyrillic 'Е' value ≠ ASCII "EU"


# ── NFC/NFD normalization mismatch (report-only EF-UNICODE-NFC-1) ──────────────

def test_nfc_nfd_operand_value_mismatch_PROBE():
    """PROBE (report-only): the engine performs NO Unicode normalization. A condition
    operand authored in NFC ("café", U+00E9) does NOT match a signal value in NFD
    ("café", e + U+0301). If the matched field is attacker-influenced, a normalization
    form mismatch can silently evade a string rule. Documents the ACTUAL behavior."""
    import unicodedata
    nfc = unicodedata.normalize("NFC", "café")        # composed
    nfd = unicodedata.normalize("NFD", "café")        # decomposed
    assert nfc != nfd                                       # they are distinct strings
    cond = compile_condition(f'action_class == "{nfc}"')
    assert cond.evaluate({"action_class": nfd}) is False    # no normalization → no match
    assert cond.evaluate({"action_class": nfc}) is True


# ── Overlong inputs ─────────────────────────────────────────────────────────────

def test_overlong_field_name_rejected():
    with pytest.raises(ConditionError):
        compile_condition(("x" * 5000) + " < 90")


def test_overlong_source_rejected_by_length_bound():
    # A single huge string operand beyond the source-length cap → controlled rejection.
    huge = "a" * 200_000
    with pytest.raises(ConditionCompileError):
        compile_condition(f'region == "{huge}"')


def test_long_but_bounded_operand_compiles_and_matches():
    val = "a" * 1000
    cond = compile_condition(f'region == "{val}"')
    assert cond.evaluate({"region": val}) is True
