"""The sandboxed condition language — deterministic, allowlisted, no code execution.

A rule's ``condition`` is a small boolean expression over the typed signal context.
It is compiled ONCE (parse → strict allowlist validation → reusable object) and then
evaluated against a context as a hand-written tree walk. We never call ``eval``,
``exec``, ``compile`` (to a code object), ``pickle``, or any builtin.

Grammar (everything else is rejected at compile time)::

    expr      := or_expr
    or_expr   := and_expr ("or" and_expr)*
    and_expr  := not_expr ("and" not_expr)*
    not_expr  := "not" not_expr | comparison
    comparison:= operand (CMP operand)+ | operand
    CMP       := "==" | "!=" | "<" | "<=" | ">" | ">=" | "in" | "not in"
    operand   := FIELD | LITERAL | "[" LITERAL ("," LITERAL)* "]" | ("-" | "+") NUMBER
    FIELD     := a declared name in SIGNAL_FIELDS
    LITERAL   := number | string | True | False | None

Disallowed and rejected (sandbox-escape surface): function calls, attribute access
(``x.__class__``), subscripting (``x[0]``), arithmetic binary ops, lambdas,
comprehensions, f-strings, walrus, starred, dict/set literals, and any name that is
not a declared field (so ``__import__``, ``os``, ``eval`` are simply "unknown fields"
*and* their call syntax is rejected anyway).

Evaluation-time errors:
  * :class:`UnknownFieldError`  — a referenced name is not declared (also caught at
    compile time; re-checked at runtime for defense in depth). Never silently false.
  * :class:`MissingSignalError` — a declared field is present-but-None (the signal
    did not arrive). The engine maps this to the rule's ``fail_mode``.
  * :class:`ConditionRuntimeError` — any other runtime fault (e.g. comparing
    incompatible types). Also mapped to ``fail_mode``.
"""

from __future__ import annotations

import ast
from typing import Any, Iterable, Mapping, Optional, Set

from src.policy.context import SIGNAL_FIELDS


# ═══════════════════════════════════════════════════════════════════════════════
#  ERRORS
# ═══════════════════════════════════════════════════════════════════════════════


class ConditionError(ValueError):
    """Base: a condition could not be compiled or evaluated."""


class ConditionCompileError(ConditionError):
    """Raised at compile time for syntax errors or disallowed constructs."""


class UnknownFieldError(ConditionError):
    """A condition references a name that is not a declared signal field."""


class MissingSignalError(ConditionError):
    """A declared field was referenced but its value is None (signal absent)."""


class ConditionRuntimeError(ConditionError):
    """Any other fault while evaluating a (valid) condition against a context."""


# ═══════════════════════════════════════════════════════════════════════════════
#  ALLOWLIST
# ═══════════════════════════════════════════════════════════════════════════════

# Only these AST node types may appear anywhere in a condition. Anything else →
# ConditionCompileError. This is an allowlist, not a denylist: new/unknown node
# types are rejected by default, which is the safe failure direction.
_ALLOWED_NODES: tuple = (
    ast.Expression,
    ast.BoolOp, ast.And, ast.Or,
    ast.UnaryOp, ast.Not, ast.USub, ast.UAdd,
    ast.Compare,
    ast.Eq, ast.NotEq, ast.Lt, ast.LtE, ast.Gt, ast.GtE, ast.In, ast.NotIn,
    ast.Name, ast.Load,
    ast.Constant,
    ast.List, ast.Tuple,
)

# Constant value types we accept as literals.
_ALLOWED_CONST_TYPES: tuple = (str, int, float, bool, type(None))


# ═══════════════════════════════════════════════════════════════════════════════
#  COMPILED CONDITION
# ═══════════════════════════════════════════════════════════════════════════════


class CompiledCondition:
    """A validated, reusable condition. ``evaluate(context)`` is pure and fast."""

    __slots__ = ("source", "_tree", "_referenced_fields")

    def __init__(self, source: str, tree: ast.Expression, referenced_fields: Set[str]):
        self.source = source
        self._tree = tree
        self._referenced_fields = referenced_fields

    @property
    def referenced_fields(self) -> Set[str]:
        """The declared fields this condition reads (for diagnostics/audit)."""
        return set(self._referenced_fields)

    def evaluate(self, context: Mapping[str, Any]) -> bool:
        """Evaluate against a field→value mapping. Returns a strict bool.

        Raises UnknownFieldError / MissingSignalError / ConditionRuntimeError.
        """
        result = _eval_node(self._tree.body, context)
        # A condition must yield a boolean verdict. Coerce only true booleans;
        # anything else is a malformed rule (e.g. a bare field reference).
        if isinstance(result, bool):
            return result
        raise ConditionRuntimeError(
            f"Condition did not evaluate to a boolean: {self.source!r} → {result!r}"
        )


# ═══════════════════════════════════════════════════════════════════════════════
#  COMPILE
# ═══════════════════════════════════════════════════════════════════════════════


def compile_condition(
    source: str,
    allowed_fields: Optional[Iterable[str]] = None,
) -> CompiledCondition:
    """Parse + validate a condition string into a reusable :class:`CompiledCondition`.

    All sandbox-escape attempts (calls, attribute access, unknown names, etc.) are
    rejected HERE, at load time — never deferred to evaluation.
    """
    fields = set(allowed_fields) if allowed_fields is not None else set(SIGNAL_FIELDS)

    if not isinstance(source, str) or not source.strip():
        raise ConditionCompileError("Condition must be a non-empty string")

    try:
        tree = ast.parse(source, mode="eval")
    except SyntaxError as exc:
        raise ConditionCompileError(f"Condition syntax error: {exc}") from exc

    referenced: Set[str] = set()
    _validate(tree, fields, referenced)
    return CompiledCondition(source=source, tree=tree, referenced_fields=referenced)


def _validate(node: ast.AST, fields: Set[str], referenced: Set[str]) -> None:
    """Walk the tree; reject any disallowed node, name, or literal."""
    if not isinstance(node, _ALLOWED_NODES):
        raise ConditionCompileError(
            f"Disallowed expression element: {type(node).__name__} "
            f"(only comparisons, boolean ops, fields and literals are permitted)"
        )

    if isinstance(node, ast.Name):
        if not isinstance(node.ctx, ast.Load):
            raise ConditionCompileError("Assignment / store context is not allowed")
        if node.id not in fields:
            raise UnknownFieldError(
                f"Unknown field in condition: {node.id!r}. "
                f"Declared fields: {sorted(fields)}"
            )
        referenced.add(node.id)
        return

    if isinstance(node, ast.Constant):
        if not isinstance(node.value, _ALLOWED_CONST_TYPES):
            raise ConditionCompileError(
                f"Disallowed literal type: {type(node.value).__name__}"
            )
        return

    for child in ast.iter_child_nodes(node):
        _validate(child, fields, referenced)


# ═══════════════════════════════════════════════════════════════════════════════
#  EVALUATE  (hand-written tree-walking interpreter — zero dynamic execution)
# ═══════════════════════════════════════════════════════════════════════════════

_CMP_FUNCS = {
    ast.Eq:    lambda a, b: a == b,
    ast.NotEq: lambda a, b: a != b,
    ast.Lt:    lambda a, b: a < b,
    ast.LtE:   lambda a, b: a <= b,
    ast.Gt:    lambda a, b: a > b,
    ast.GtE:   lambda a, b: a >= b,
    ast.In:    lambda a, b: a in b,
    ast.NotIn: lambda a, b: a not in b,
}


def _eval_node(node: ast.AST, ctx: Mapping[str, Any]) -> Any:
    if isinstance(node, ast.BoolOp):
        # Short-circuit, matching ordinary boolean semantics. An operand that is
        # short-circuited away is never evaluated, so a guarded missing-signal
        # reference (e.g. `bias_evaluated == false or bias_score < 40`) does not
        # raise. A reached missing reference still raises → fail_mode.
        if isinstance(node.op, ast.And):
            for operand in node.values:
                if not _truthy(_eval_node(operand, ctx)):
                    return False
            return True
        # Or
        for operand in node.values:
            if _truthy(_eval_node(operand, ctx)):
                return True
        return False

    if isinstance(node, ast.UnaryOp):
        val = _eval_node(node.operand, ctx)
        if isinstance(node.op, ast.Not):
            return not _truthy(val)
        if isinstance(node.op, ast.USub):
            return -val
        if isinstance(node.op, ast.UAdd):
            return +val
        raise ConditionRuntimeError(f"Unsupported unary op: {type(node.op).__name__}")

    if isinstance(node, ast.Compare):
        left = _eval_node(node.left, ctx)
        # Support chained comparisons (a < b < c) with standard semantics.
        for op, comparator in zip(node.ops, node.comparators):
            right = _eval_node(comparator, ctx)
            func = _CMP_FUNCS.get(type(op))
            if func is None:
                raise ConditionRuntimeError(f"Unsupported comparison: {type(op).__name__}")
            try:
                outcome = func(left, right)
            except TypeError as exc:
                raise ConditionRuntimeError(
                    f"Type error comparing {left!r} and {right!r}: {exc}"
                ) from exc
            if not outcome:
                return False
            left = right
        return True

    if isinstance(node, ast.Name):
        if node.id not in SIGNAL_FIELDS:
            # Defense in depth — compile already caught this.
            raise UnknownFieldError(f"Unknown field: {node.id!r}")
        if node.id not in ctx or ctx[node.id] is None:
            raise MissingSignalError(
                f"Signal field {node.id!r} is missing/None in this context "
                f"(the pillar did not produce it). Rule will respect its fail_mode."
            )
        return ctx[node.id]

    if isinstance(node, ast.Constant):
        return node.value

    if isinstance(node, (ast.List, ast.Tuple)):
        return [_eval_node(elt, ctx) for elt in node.elts]

    raise ConditionRuntimeError(f"Unsupported node at evaluation: {type(node).__name__}")


def _truthy(value: Any) -> bool:
    """Boolean coercion for boolean-op operands. Missing/None never reaches here
    (it raises during _eval_node), so this only sees concrete values."""
    return bool(value)
