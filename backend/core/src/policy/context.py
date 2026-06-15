"""The typed signal context — the engine's only input besides the policy.

A :class:`SignalContext` is a *typed, declared* namespace of fields that policy
conditions may reference. It carries three kinds of inputs:

  1. Pillar signals  — per-pillar safety score (0-100), a 0-1 risk value, an
     ``*_evaluated`` boolean, and the pillar's flags.
  2. A composite score (0-1) when available.
  3. Request metadata — region, action_class, data_categories, blast_radius.

Two rules are sacred (§2.4):

  * **A skipped evaluation is never a pass.** When a pillar short-circuited without
    actually assessing its risk dimension (the bias ``score=92`` demographic
    fast-path, or any degraded/PARTIAL result), its ``*_score``/``*_risk`` fields
    are ``None`` (missing) and ``*_evaluated`` is ``False``. A policy author can
    write a rule on ``bias_evaluated == false``; a rule that references the missing
    ``bias_score`` will *error* and respect its ``fail_mode`` — it can never read 92
    as a passing score.
  * **A field that exists but is absent is missing, not false.** Referencing a
    ``None`` field raises ``MissingSignalError`` at evaluation; referencing a name
    that is not a declared field raises ``UnknownFieldError`` at compile time.

The declared field set is :data:`SIGNAL_FIELDS`. The evaluator validates every
``Name`` in a condition against it, so typos are caught when a policy is loaded,
not at request time.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Mapping, Optional

# Pillar id (as produced by the pillar implementations) → context field prefix.
# Both the REST pillars (src.pillars.implementations.ai_safety_pillars) and the
# SDK pillars produce these ids; the prefix is the stable policy-facing name.
_PILLAR_PREFIX: Dict[str, str] = {
    "safety_toxicity": "safety",
    "hallucination": "hallucination",
    "bias_fairness": "bias",
    "prompt_security": "prompt_security",
    "compliance_policy": "compliance",
    # SDK pillar ids (already short) map to themselves
    "safety": "safety",
    "bias": "bias",
}


# ── Declared field schema ──────────────────────────────────────────────────────
# Maps field name → a tuple of accepted python types (for documentation + light
# runtime validation). ``type(None)`` is implied for nullable signal fields and is
# handled specially by the evaluator (None → MissingSignalError when referenced).

_PILLAR_NAMES = ("safety", "hallucination", "bias", "prompt_security", "compliance")

SIGNAL_FIELDS: Dict[str, tuple] = {}
for _p in _PILLAR_NAMES:
    SIGNAL_FIELDS[f"{_p}_score"] = (int, float)        # 0-100, higher = safer (nullable)
    SIGNAL_FIELDS[f"{_p}_risk"] = (int, float)         # 0-1, higher = riskier (nullable)
    SIGNAL_FIELDS[f"{_p}_evaluated"] = (bool,)         # did the pillar actually assess? (never null)
SIGNAL_FIELDS["composite_score"] = (int, float)        # 0-1, higher = more trusted (nullable)
# Request metadata
SIGNAL_FIELDS["region"] = (str,)                       # e.g. "EU", "US" (nullable)
SIGNAL_FIELDS["action_class"] = (str,)                 # e.g. "wire_transfer" (nullable)
SIGNAL_FIELDS["data_categories"] = (list, tuple)       # e.g. ["pii","phi"] (defaults to [])
SIGNAL_FIELDS["blast_radius"] = (int,)                 # scope/affected count (nullable)

# Fields that are NEVER missing (always a concrete bool, even when a pillar skipped).
_NEVER_NULL = frozenset(f"{p}_evaluated" for p in _PILLAR_NAMES)


@dataclass(frozen=True)
class SignalContext:
    """An immutable snapshot of the inputs to a single policy decision.

    Construct directly in tests, or via :meth:`from_pillar_results` from a live
    evaluation. ``values`` holds exactly the declared :data:`SIGNAL_FIELDS`.
    """

    values: Mapping[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        unknown = set(self.values) - set(SIGNAL_FIELDS)
        if unknown:
            raise KeyError(
                f"SignalContext contains undeclared fields: {sorted(unknown)}. "
                f"Declared fields are: {sorted(SIGNAL_FIELDS)}"
            )
        # Normalize: every *_evaluated field must be present and a real bool.
        normalized = dict(self.values)
        for name in _NEVER_NULL:
            normalized.setdefault(name, False)
            if not isinstance(normalized[name], bool):
                normalized[name] = bool(normalized[name])
        normalized.setdefault("data_categories", [])
        object.__setattr__(self, "values", normalized)

    def has(self, name: str) -> bool:
        """True if the field is declared AND present with a non-None value."""
        return name in self.values and self.values[name] is not None

    def get(self, name: str) -> Any:
        """Raw value (may be None) for a declared field; KeyError if undeclared."""
        if name not in SIGNAL_FIELDS:
            raise KeyError(name)
        return self.values.get(name)

    def snapshot(self) -> Dict[str, Any]:
        """A JSON-serializable copy for the audit record (the exact inputs)."""
        out: Dict[str, Any] = {}
        for k, v in self.values.items():
            out[k] = list(v) if isinstance(v, tuple) else v
        return out

    # ── adapter from live pillar results ──────────────────────────────────────
    @classmethod
    def from_pillar_results(
        cls,
        pillar_results: Mapping[str, Any],
        *,
        composite_score: Optional[float] = None,
        region: Optional[str] = None,
        action_class: Optional[str] = None,
        data_categories: Optional[List[str]] = None,
        blast_radius: Optional[int] = None,
    ) -> "SignalContext":
        """Build a SignalContext from a ``{pillar_id: PillarResult}`` mapping.

        ``evaluated`` is derived from how the pillar produced its score:
          * ``details["method"] == "demographic_fast_path"`` → ``evaluated=False``
            (the ``score=92`` skip — it did NOT assess bias, so the 92 is suppressed).
          * ``status`` PARTIAL/FAILED/SKIPPED, or ``details["fallback"]`` truthy →
            ``evaluated=False`` (LLM judge timed out / circuit broke / parse failed).
          * otherwise → ``evaluated=True`` and the 0-100 score + 0-1 risk are exposed.

        Regex fast-paths that genuinely *detected* something (explicit content,
        prompt injection) are real assessments → ``evaluated=True``.
        """
        values: Dict[str, Any] = {}
        for pillar_id, result in pillar_results.items():
            prefix = _PILLAR_PREFIX.get(pillar_id)
            if prefix is None:
                continue  # unknown pillar id → not exposed to policy authors
            evaluated, score_value, risk_value = _interpret_result(result)
            values[f"{prefix}_evaluated"] = evaluated
            if evaluated:
                values[f"{prefix}_score"] = score_value
                values[f"{prefix}_risk"] = risk_value
            else:
                # Suppressed: a skipped/degraded evaluation must not masquerade as a pass.
                values[f"{prefix}_score"] = None
                values[f"{prefix}_risk"] = None

        if composite_score is not None:
            values["composite_score"] = composite_score
        if region is not None:
            values["region"] = region
        if action_class is not None:
            values["action_class"] = action_class
        values["data_categories"] = list(data_categories) if data_categories else []
        if blast_radius is not None:
            values["blast_radius"] = blast_radius
        return cls(values=values)


def _interpret_result(result: Any) -> tuple[bool, Optional[float], Optional[float]]:
    """Return ``(evaluated, score_0_100, risk_0_1)`` for one PillarResult.

    Defensive against both the core ``PillarResult`` (status enum value "success"/
    "partial"/…) and any duck-typed stand-in used in tests.
    """
    status = getattr(result, "status", None)
    status_str = getattr(status, "value", status)  # enum → its .value, else raw
    details = getattr(result, "details", {}) or {}
    score_obj = getattr(result, "score", None)
    score_value = getattr(score_obj, "value", None)

    method = details.get("method")
    is_fallback = bool(details.get("fallback"))
    skipped_or_degraded = status_str in ("partial", "failed", "skipped")

    evaluated = not (
        method == "demographic_fast_path"  # the score=92 bias fast-path
        or is_fallback
        or skipped_or_degraded
        or score_value is None
    )

    if not evaluated:
        return False, None, None

    # 0-1 risk: prefer the pillar's own nim_risk_score, else derive from the score.
    nim_risk = details.get("nim_risk_score")
    if nim_risk is None and score_value is not None:
        nim_risk = 1.0 - (float(score_value) / 100.0)
    risk_value = None if nim_risk is None else max(0.0, min(1.0, float(nim_risk)))
    return True, float(score_value), risk_value
