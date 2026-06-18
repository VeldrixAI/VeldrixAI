"""Domain 3.1 — Condition Evaluator Sandbox Escape  [OWASP LLM01-adjacent / code-exec].

Guarantee under test (evaluator.py:4-6, :134-137): the condition language compiles
to an allowlisted AST and is walked by a hand-written interpreter; no eval/exec/
compile/builtin/attribute/call/subscript is reachable, and every escape attempt is
rejected at LOAD time. Unknown names are rejected; type-confusion errors map to
ConditionRuntimeError (→ rule fail_mode), never a crash or silent truth.

A PASSING test = the guarantee HELD against that attack. A FAILING test would mean
the sandbox was DEFEATED. We do not fix anything here — we record.
"""

from __future__ import annotations

import sys

import pytest

from src.policy.evaluator import (
    ConditionCompileError,
    ConditionError,
    ConditionRuntimeError,
    MissingSignalError,
    UnknownFieldError,
    compile_condition,
)

# A condition referencing a real declared field, used as a benign control.
VALID = "safety_score < 90"


# ── 1. Code-execution / escape constructs rejected AT COMPILE ──────────────────

@pytest.mark.parametrize(
    "payload",
    [
        "__import__('os')",                     # call + dunder name
        "__import__('os').system('echo x')",    # chained call/attr
        "open('/etc/passwd')",                  # builtin call
        "eval('1+1')",                          # eval by name
        "().__class__",                         # attribute traversal off a literal
        "safety_score.__class__",               # attribute traversal off a field
        "safety_score.__class__.__mro__",       # object-graph walk
        "data_categories[0]",                   # subscript
        "(lambda: 1)()",                         # lambda + call
        "[x for x in data_categories]",         # comprehension
        "{1: 2}",                                # dict literal
        "{1, 2}",                                # set literal
        "safety_score + 1",                     # arithmetic BinOp
        "safety_score * 2",                     # arithmetic BinOp
        "(safety_score := 1)",                  # walrus
        "[*data_categories]",                   # starred
    ],
)
def test_escape_constructs_rejected_at_compile(payload):
    """Every classic sandbox-escape construct must raise at compile_condition()."""
    with pytest.raises(ConditionError) as exc:
        compile_condition(payload)
    # All of these are structural (disallowed node) — not deferred to evaluation.
    assert isinstance(exc.value, (ConditionCompileError, UnknownFieldError))


@pytest.mark.parametrize(
    "payload",
    [
        'f"{safety_score}"',                    # f-string / template injection style
        'f"{__import__(chr(111))}"',            # f-string hiding a call
    ],
)
def test_fstring_template_injection_rejected(payload):
    """Format-string / template-injection payloads in a policy field are rejected."""
    with pytest.raises(ConditionError):
        compile_condition(payload)


# ── 2. Unknown names (os, __builtins__, typos) are 'unknown fields' ────────────

@pytest.mark.parametrize(
    "payload",
    ["os", "sys", "__builtins__", "globals", "True_field", "SAFETY_SCORE"],
)
def test_unknown_names_rejected(payload):
    with pytest.raises(UnknownFieldError):
        compile_condition(payload)


# ── 3. Unicode homoglyph attacks ───────────────────────────────────────────────

def test_homoglyph_field_name_is_unknown_field():
    """A Cyrillic-'a' look-alike of safety_score must NOT match the ASCII field."""
    homoglyph = "sаfety_score < 90"  # the 'a' is U+0430 CYRILLIC SMALL A
    with pytest.raises(UnknownFieldError):
        compile_condition(homoglyph)


def test_homoglyph_operator_is_syntax_error():
    """Fullwidth '==' is not a Python operator → SyntaxError → ConditionCompileError."""
    with pytest.raises(ConditionCompileError):
        compile_condition("safety_score ＝＝ 90")  # fullwidth '=='


# ── 4. Type-confusion operands → ConditionRuntimeError, never a crash ──────────

def test_string_in_number_raises_runtime_error():
    cond = compile_condition("region in safety_score")
    with pytest.raises(ConditionRuntimeError):
        cond.evaluate({"region": "EU", "safety_score": 90})


def test_list_compared_to_int_raises_runtime_error():
    cond = compile_condition("data_categories < blast_radius")
    with pytest.raises(ConditionRuntimeError):
        cond.evaluate({"data_categories": ["pii"], "blast_radius": 3})


def test_bare_field_is_not_a_boolean_verdict():
    """A condition that resolves to a non-bool (a bare field) is a malformed rule,
    not a silent truthy pass (evaluator.py:118-122)."""
    cond = compile_condition("safety_score")
    with pytest.raises(ConditionRuntimeError):
        cond.evaluate({"safety_score": 90})


# ── 5. Missing vs unknown distinction holds at evaluation ──────────────────────

def test_missing_signal_raises_missing_not_false():
    """Referencing a declared-but-None field raises MissingSignalError (→ fail_mode),
    it never reads as False/pass (context.py:11-22)."""
    cond = compile_condition("bias_score < 40")
    with pytest.raises(MissingSignalError):
        cond.evaluate({"bias_score": None})


# ── 6. Resource exhaustion: deep nesting at compile (DoS probe) ────────────────

def test_deeply_nested_unaryop_DEFEAT_uncontrolled_resource_exhaustion():
    """[HELD — Finding F-EVAL-DOS-1 fixed | OWASP LLM10 Unbounded Consumption]

    compile_condition() now bounds both source length and AST depth, and converts any
    RecursionError/MemoryError during parse/validate into a controlled
    ConditionCompileError. A crafted condition of deeply nested unary ops is therefore
    rejected at load time with a *controlled* ConditionError — never an uncontrolled
    RecursionError/MemoryError out of PolicyEngine.load_policy().

    (Test name kept for report-traceability; the assertion flipped DEFEAT→HELD — deep
    nesting now raises a controlled ConditionError, and is asserted NOT to raise the
    uncontrolled resource errors.)
    """
    depth = 5000
    payload = ("not " * depth) + "safety_evaluated"
    with pytest.raises(ConditionCompileError):
        compile_condition(payload)

    # And it must be a *controlled* rejection — not the uncontrolled resource errors.
    try:
        compile_condition(payload)
    except (RecursionError, MemoryError):  # pragma: no cover - would be a regression
        pytest.fail("deep nesting raised an UNCONTROLLED resource error, not ConditionError")
    except ConditionCompileError:
        pass


def test_moderately_deep_nesting_also_controlled():
    """A nesting depth just over the bound is rejected the same controlled way (not a
    crash), confirming the depth guard — not only the length guard — does the work."""
    payload = ("not " * 300) + "safety_evaluated"   # well under the length cap
    with pytest.raises(ConditionCompileError):
        compile_condition(payload)


def test_wide_boolop_is_flat_and_safe():
    """A wide `a or a or ... a` is a single flat BoolOp (not nested) — confirm it
    compiles and evaluates without recursion problems (control for the test above)."""
    cond = compile_condition(" or ".join(["safety_score < 90"] * 2000))
    assert cond.evaluate({"safety_score": 10}) is True
    assert cond.evaluate({"safety_score": 95}) is False


if __name__ == "__main__":  # pragma: no cover
    sys.exit(pytest.main([__file__, "-v"]))
