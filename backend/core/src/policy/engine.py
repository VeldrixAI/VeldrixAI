"""The Policy Engine — pure, deterministic, sub-millisecond decision over signals.

``decide()`` and ``simulate()`` take an already-built :class:`SignalContext` and a
loaded :class:`Policy`, evaluate every rule, resolve a winner by the §2.3 precedence,
apply safe fallbacks (§2.4), apply the per-tenant enforcement mode (§2.8), and return
a complete :class:`Decision`. ``decide()`` additionally emits exactly ONE audit
record via the injected sink; ``simulate()`` emits nothing and has no side effects.

The decision path performs no network or LLM I/O. Policies are compiled (conditions
parsed + validated) once and cached by ``(policy_id, version)``; the hot path walks
the pre-validated AST only.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional, Tuple

from src.policy.context import SignalContext
from src.policy.evaluator import (
    CompiledCondition,
    ConditionRuntimeError,
    MissingSignalError,
    UnknownFieldError,
    compile_condition,
)
from src.policy.resolution import Candidate, ResolutionOutcome, resolve
from src.policy.schema import (
    Action,
    EnforcementMode,
    FailMode,
    Policy,
    Rule,
    Severity,
)

logger = logging.getLogger("veldrix.policy")

# Actions that can actually GATE traffic in this phase. Block/escalate are
# expressible as a returned gating decision today. mask/rewrite/regenerate/
# disclaimer require a response-path runtime that does not exist yet (see RECON §5),
# so even under `enforce` they record their intent with enforced=false rather than
# implying an enforcement that did not occur.
_GATING_ACTIONS = frozenset({Action.BLOCK, Action.ESCALATE})


# ═══════════════════════════════════════════════════════════════════════════════
#  DECISION RECORD TYPES
# ═══════════════════════════════════════════════════════════════════════════════


@dataclass(frozen=True)
class RuleEvaluation:
    """The outcome of evaluating one rule — every rule is recorded, winner or not."""

    rule_id: str
    authored_action: Action
    effective_action: Action
    severity: Severity
    priority: int
    fail_mode: FailMode
    matched: bool
    won: bool
    errored: bool = False
    error_type: Optional[str] = None
    error_message: Optional[str] = None
    fail_mode_applied: Optional[FailMode] = None
    note: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "rule_id": self.rule_id,
            "authored_action": self.authored_action.value,
            "effective_action": self.effective_action.value,
            "severity": self.severity.value,
            "priority": self.priority,
            "fail_mode": self.fail_mode.value,
            "matched": self.matched,
            "won": self.won,
            "errored": self.errored,
            "error_type": self.error_type,
            "error_message": self.error_message,
            "fail_mode_applied": self.fail_mode_applied.value if self.fail_mode_applied else None,
            "note": self.note,
        }


@dataclass(frozen=True)
class Decision:
    """The complete, reproducible result of one policy decision.

    The record distinguishes *the decision reached* (``decided_action``) from
    *whether it was enforced* (``enforced``) and *under which mode* (``mode``) — it
    never implies enforcement that did not occur, nor a no-op when a critical
    decision was actually gated.
    """

    policy_id: str
    version: int
    checksum: str
    tenant_id: Optional[str]
    request_id: Optional[str]

    mode: EnforcementMode
    decided_action: Action
    decided_severity: Optional[Severity]
    enforced: bool

    winning_rule_id: Optional[str]
    decided_by: str
    resolution_reason: str
    fail_mode_applied: Optional[FailMode]

    rule_evaluations: Tuple[RuleEvaluation, ...]
    signal_snapshot: Dict[str, Any]

    engine_error: bool = False
    engine_error_message: Optional[str] = None
    evaluated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    # ── deterministic core (excludes volatile request_id / timestamp) ──────────
    def signature(self) -> Dict[str, Any]:
        """Canonical, volatile-free view: identical inputs → identical signature."""
        return {
            "policy_id": self.policy_id,
            "version": self.version,
            "checksum": self.checksum,
            "mode": self.mode.value,
            "decided_action": self.decided_action.value,
            "decided_severity": self.decided_severity.value if self.decided_severity else None,
            "enforced": self.enforced,
            "winning_rule_id": self.winning_rule_id,
            "decided_by": self.decided_by,
            "resolution_reason": self.resolution_reason,
            "fail_mode_applied": self.fail_mode_applied.value if self.fail_mode_applied else None,
            "engine_error": self.engine_error,
            "rule_evaluations": [re.to_dict() for re in self.rule_evaluations],
            "signal_snapshot": self.signal_snapshot,
        }

    def to_audit_metadata(self) -> Dict[str, Any]:
        """Full record for the AuditLog — sufficient to reproduce the decision
        offline from policy version + signal snapshot alone."""
        meta = self.signature()
        meta.update(
            {
                "request_id": self.request_id,
                "tenant_id": self.tenant_id,
                "engine_error_message": self.engine_error_message,
                "evaluated_at": self.evaluated_at.isoformat(),
                "record_kind": "policy_engine_error" if self.engine_error else "policy_decision",
            }
        )
        return meta


# ═══════════════════════════════════════════════════════════════════════════════
#  COMPILED POLICY (cached)
# ═══════════════════════════════════════════════════════════════════════════════


@dataclass(frozen=True)
class _CompiledPolicy:
    policy: Policy
    compiled_rules: Tuple[Tuple[Rule, CompiledCondition], ...]


# ═══════════════════════════════════════════════════════════════════════════════
#  ENGINE
# ═══════════════════════════════════════════════════════════════════════════════


class PolicyEngine:
    """Evaluates policies against signal contexts. Stateless except a compile cache.

    Args:
        audit_sink: Called with the audit-record dict for each ``decide()`` (never
            for ``simulate()``). Must not raise. Defaults to a fire-and-forget POST
            to the connectors AuditLog. Inject a recording callable in tests.
    """

    def __init__(self, audit_sink: Optional[Callable[[Dict[str, Any]], None]] = None):
        self._cache: Dict[Tuple[str, int], _CompiledPolicy] = {}
        if audit_sink is None:
            from src.policy.audit_bridge import emit_decision_record
            audit_sink = emit_decision_record
        self._audit_sink = audit_sink

    # ── policy loading / caching ──────────────────────────────────────────────
    def load_policy(self, policy: Policy) -> _CompiledPolicy:
        """Compile + cache a policy by ``(policy_id, version)``.

        Compiles every rule's condition (rejecting malformed/sandbox-escaping
        conditions at load time). Idempotent: re-loading the same version returns
        the cached compilation and verifies the checksum is unchanged.
        """
        key = (policy.policy_id, policy.version)
        cached = self._cache.get(key)
        if cached is not None:
            if cached.policy.checksum != policy.checksum:
                raise ValueError(
                    f"Policy {policy.policy_id} v{policy.version} was already loaded with a "
                    f"different checksum — versions are immutable; bump the version instead."
                )
            return cached

        compiled_rules = tuple(
            (rule, compile_condition(rule.condition)) for rule in policy.rules
        )
        compiled = _CompiledPolicy(policy=policy, compiled_rules=compiled_rules)
        self._cache[key] = compiled
        return compiled

    # ── public entry points ───────────────────────────────────────────────────
    def simulate(
        self,
        policy: Policy,
        context: SignalContext,
        mode: EnforcementMode = EnforcementMode.SHADOW,
        *,
        tenant_id: Optional[str] = None,
        request_id: Optional[str] = None,
    ) -> Decision:
        """Return the decision WITHOUT enforcing or writing to the AuditLog.

        For the customer's policy-testing UI and regression tests. Pure and free of
        side effects.
        """
        return self._decide_inner(policy, context, mode, tenant_id, request_id)

    def decide(
        self,
        policy: Policy,
        context: SignalContext,
        mode: EnforcementMode = EnforcementMode.SHADOW,
        *,
        tenant_id: Optional[str] = None,
        request_id: Optional[str] = None,
    ) -> Decision:
        """Evaluate, resolve, apply mode, write exactly ONE audit record, and return.

        The decision computation is pure CPU (sub-ms); the audit write is delegated
        to the injected sink (fire-and-forget by default) and never blocks the caller.
        """
        decision = self._decide_inner(policy, context, mode, tenant_id, request_id)
        try:
            self._audit_sink(decision.to_audit_metadata())
        except Exception as exc:  # an audit-sink failure must never break enforcement
            logger.error(
                "policy.audit_sink_failed request_id=%s policy=%s v%s: %s",
                request_id, policy.policy_id, policy.version, exc,
            )
        return decision

    # ── core decision (no side effects) ───────────────────────────────────────
    def _decide_inner(
        self,
        policy: Policy,
        context: SignalContext,
        mode: EnforcementMode,
        tenant_id: Optional[str],
        request_id: Optional[str],
    ) -> Decision:
        snapshot = context.snapshot()
        try:
            compiled = self.load_policy(policy)
            candidates, rule_evals = self._evaluate_rules(compiled, context)
            outcome = resolve(candidates)
            return self._build_decision(
                policy, mode, tenant_id, request_id, snapshot, candidates, rule_evals, outcome
            )
        except Exception as exc:  # noqa: BLE001 — fail closed on ANY engine fault
            # Internal engine exception → fail closed; never a silent allow. Treated
            # as critical so enforce_critical_only also gates it. Recorded with an
            # explicit engine_error marker by to_audit_metadata().
            logger.error(
                "policy.engine_error request_id=%s policy=%s v%s: %s",
                request_id, policy.policy_id, policy.version, exc, exc_info=True,
            )
            decided_action = Action.BLOCK
            decided_severity = Severity.CRITICAL
            enforced = _compute_enforced(decided_action, decided_severity, mode)
            return Decision(
                policy_id=policy.policy_id,
                version=policy.version,
                checksum=policy.checksum,
                tenant_id=tenant_id,
                request_id=request_id,
                mode=mode,
                decided_action=decided_action,
                decided_severity=decided_severity,
                enforced=enforced,
                winning_rule_id=None,
                decided_by="engine_error",
                resolution_reason=(
                    "Policy Engine internal error — failed closed to BLOCK "
                    "(treated as critical). See engine_error_message."
                ),
                fail_mode_applied=FailMode.FAIL_CLOSED,
                rule_evaluations=tuple(),
                signal_snapshot=snapshot,
                engine_error=True,
                engine_error_message=f"{type(exc).__name__}: {exc}",
            )

    def _evaluate_rules(
        self, compiled: _CompiledPolicy, context: SignalContext
    ) -> Tuple[List[Candidate], List[RuleEvaluation]]:
        candidates: List[Candidate] = []
        rule_evals: List[RuleEvaluation] = []

        for idx, (rule, cond) in enumerate(compiled.compiled_rules):
            try:
                matched = cond.evaluate(context.values)
                if matched:
                    candidates.append(
                        Candidate(rule=rule, order_index=idx, effective_action=rule.action)
                    )
                rule_evals.append(
                    RuleEvaluation(
                        rule_id=rule.id,
                        authored_action=rule.action,
                        effective_action=rule.action,
                        severity=rule.severity,
                        priority=rule.priority,
                        fail_mode=rule.fail_mode,
                        matched=matched,
                        won=False,  # set later
                        note="matched" if matched else "did not match",
                    )
                )
            except (UnknownFieldError, MissingSignalError, ConditionRuntimeError) as exc:
                error_type = type(exc).__name__
                if rule.fail_mode == FailMode.FAIL_CLOSED:
                    eff = _failclosed_action(rule.severity)
                    candidates.append(
                        Candidate(
                            rule=rule, order_index=idx, effective_action=eff, errored=True
                        )
                    )
                    rule_evals.append(
                        RuleEvaluation(
                            rule_id=rule.id,
                            authored_action=rule.action,
                            effective_action=eff,
                            severity=rule.severity,
                            priority=rule.priority,
                            fail_mode=rule.fail_mode,
                            matched=True,
                            won=False,
                            errored=True,
                            error_type=error_type,
                            error_message=str(exc),
                            fail_mode_applied=FailMode.FAIL_CLOSED,
                            note=f"condition errored ({error_type}); failed CLOSED → {eff.value}",
                        )
                    )
                else:  # FAIL_OPEN — recorded as errored + non-firing, never silently false
                    rule_evals.append(
                        RuleEvaluation(
                            rule_id=rule.id,
                            authored_action=rule.action,
                            effective_action=rule.action,
                            severity=rule.severity,
                            priority=rule.priority,
                            fail_mode=rule.fail_mode,
                            matched=False,
                            won=False,
                            errored=True,
                            error_type=error_type,
                            error_message=str(exc),
                            fail_mode_applied=FailMode.FAIL_OPEN,
                            note=f"condition errored ({error_type}); failed OPEN → did not fire",
                        )
                    )
        return candidates, rule_evals

    def _build_decision(
        self,
        policy: Policy,
        mode: EnforcementMode,
        tenant_id: Optional[str],
        request_id: Optional[str],
        snapshot: Dict[str, Any],
        candidates: List[Candidate],
        rule_evals: List[RuleEvaluation],
        outcome: ResolutionOutcome,
    ) -> Decision:
        if outcome.winner is None:
            # No rule matched → the policy's declared default_action (never implicit allow).
            decided_action = policy.default_action
            decided_severity: Optional[Severity] = None
            winning_rule_id: Optional[str] = None
            decided_by = "default_action"
            reason = (
                f"No rule matched; applied policy default_action={decided_action.value}."
            )
            fail_mode_applied: Optional[FailMode] = None
            final_evals = tuple(rule_evals)
        else:
            winner = outcome.winner
            decided_action = winner.action
            decided_severity = winner.rule.severity
            winning_rule_id = winner.rule.id
            decided_by = outcome.decided_by
            reason = outcome.reason
            fail_mode_applied = FailMode.FAIL_CLOSED if winner.errored else None
            # Mark the winning rule's evaluation row.
            final_evals = tuple(
                RuleEvaluation(**{**_re_as_kwargs(re), "won": re.rule_id == winning_rule_id})
                for re in rule_evals
            )

        enforced = _compute_enforced(decided_action, decided_severity, mode)

        return Decision(
            policy_id=policy.policy_id,
            version=policy.version,
            checksum=policy.checksum,
            tenant_id=tenant_id,
            request_id=request_id,
            mode=mode,
            decided_action=decided_action,
            decided_severity=decided_severity,
            enforced=enforced,
            winning_rule_id=winning_rule_id,
            decided_by=decided_by,
            resolution_reason=reason,
            fail_mode_applied=fail_mode_applied,
            rule_evaluations=final_evals,
            signal_snapshot=snapshot,
        )


# ═══════════════════════════════════════════════════════════════════════════════
#  HELPERS
# ═══════════════════════════════════════════════════════════════════════════════


def _failclosed_action(severity: Severity) -> Action:
    """Worst-case action for a rule that errored and must fail closed.

    Critical → BLOCK (hard stop); everything else → ESCALATE (human in the loop).
    Never returns a passing action — a missing high/critical signal can never read
    as an allow.
    """
    return Action.BLOCK if severity == Severity.CRITICAL else Action.ESCALATE


def _compute_enforced(
    action: Action, severity: Optional[Severity], mode: EnforcementMode
) -> bool:
    """§2.8 gating: does this decision actually gate traffic under the tenant's mode?

    Shadow never gates. enforce gates block/escalate. enforce_critical_only gates
    block/escalate only when the winning rule is critical severity. Non-gating
    verbs (mask/rewrite/regenerate/disclaimer/allow) never set enforced=true in this
    phase, because no response-path runtime exists to apply them yet — recording
    their intent without implying an enforcement that did not occur.
    """
    if mode == EnforcementMode.SHADOW:
        return False
    if action not in _GATING_ACTIONS:
        return False
    if mode == EnforcementMode.ENFORCE:
        return True
    if mode == EnforcementMode.ENFORCE_CRITICAL_ONLY:
        return severity == Severity.CRITICAL
    return False


def _re_as_kwargs(re: RuleEvaluation) -> Dict[str, Any]:
    """Shallow field copy of a RuleEvaluation (frozen) for rebuilding with won set."""
    return {
        "rule_id": re.rule_id,
        "authored_action": re.authored_action,
        "effective_action": re.effective_action,
        "severity": re.severity,
        "priority": re.priority,
        "fail_mode": re.fail_mode,
        "matched": re.matched,
        "won": re.won,
        "errored": re.errored,
        "error_type": re.error_type,
        "error_message": re.error_message,
        "fail_mode_applied": re.fail_mode_applied,
        "note": re.note,
    }
