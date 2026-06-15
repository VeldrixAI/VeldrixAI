"""Deterministic decision resolution when multiple rules match.

Precedence (§2.3), applied strictly in order until one rule wins:

  1. Severity            — critical > high > medium > low
  2. Action restrictiveness — block > escalate > regenerate > rewrite > mask >
                              disclaimer > allow   (most restrictive wins on tie)
  3. Priority            — higher integer wins (explicit author override)
  4. Document order      — earliest rule in the policy wins (final tie-break)

The same set of matching rules always yields the same winner, and the function
reports *which* tie-break level decided, so the audit trail can explain it.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional, Sequence

from src.policy.schema import (
    Action,
    Rule,
    action_restrictiveness,
    severity_rank,
)


@dataclass(frozen=True)
class Candidate:
    """A matching rule plus its document index (the order tie-break key).

    ``effective_action`` is the action this candidate contributes to resolution. It
    equals the rule's authored action for a normal match, but for a rule that
    *errored* and failed closed it is the worst-case action (block/escalate), set by
    the engine. Restrictiveness ranking always uses ``effective_action``.
    """

    rule: Rule
    order_index: int
    effective_action: Optional[Action] = None
    errored: bool = False

    @property
    def action(self) -> Action:
        """The action used for ranking and as the decision outcome."""
        return self.effective_action if self.effective_action is not None else self.rule.action


@dataclass(frozen=True)
class ResolutionOutcome:
    """The winner and a human-readable account of why it won."""

    winner: Optional[Candidate]
    decided_by: str          # "severity" | "restrictiveness" | "priority" | "order" | "sole_match" | "no_match"
    reason: str              # one-line auditor-facing explanation
    ranked: List[Candidate]  # all candidates in winning order (winner first)


def _sort_key(c: Candidate):
    # Higher severity, then higher restrictiveness, then higher priority win — so
    # negate them for an ascending sort; document order ascends naturally.
    return (
        -severity_rank(c.rule.severity),
        -action_restrictiveness(c.action),
        -c.rule.priority,
        c.order_index,
    )


def resolve(candidates: Sequence[Candidate]) -> ResolutionOutcome:
    """Resolve the winning rule from the matching candidates."""
    if not candidates:
        return ResolutionOutcome(
            winner=None,
            decided_by="no_match",
            reason="No rule matched; the policy's default_action applies.",
            ranked=[],
        )

    ranked = sorted(candidates, key=_sort_key)
    winner = ranked[0]

    if len(ranked) == 1:
        return ResolutionOutcome(
            winner=winner,
            decided_by="sole_match",
            reason=(
                f"Rule {winner.rule.id!r} was the only match "
                f"(action={winner.rule.action.value}, severity={winner.rule.severity.value})."
            ),
            ranked=ranked,
        )

    decided_by, reason = _explain(winner, ranked[1])
    return ResolutionOutcome(winner=winner, decided_by=decided_by, reason=reason, ranked=ranked)


def _explain(winner: Candidate, runner_up: Candidate) -> tuple[str, str]:
    """Identify the first precedence level that separates the winner from the
    next-ranked candidate, and phrase it for an auditor."""
    w, r = winner.rule, runner_up.rule

    if severity_rank(w.severity) != severity_rank(r.severity):
        return "severity", (
            f"Rule {w.id!r} won on SEVERITY: {w.severity.value} "
            f"outranks {r.severity.value} (rule {r.id!r})."
        )
    if action_restrictiveness(winner.action) != action_restrictiveness(runner_up.action):
        return "restrictiveness", (
            f"Rule {w.id!r} won on ACTION RESTRICTIVENESS: {winner.action.value} "
            f"is more restrictive than {runner_up.action.value} (rule {r.id!r}), at equal severity."
        )
    if w.priority != r.priority:
        return "priority", (
            f"Rule {w.id!r} won on PRIORITY: {w.priority} > {r.priority} "
            f"(rule {r.id!r}), at equal severity and action restrictiveness."
        )
    return "order", (
        f"Rule {w.id!r} won on DOCUMENT ORDER (position {winner.order_index}) "
        f"over {r.id!r} (position {runner_up.order_index}); all higher tie-breaks equal."
    )
