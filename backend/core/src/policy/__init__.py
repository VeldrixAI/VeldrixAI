"""VeldrixAI Policy Engine — deterministic, versioned, customer-authored enforcement.

The Policy Engine consumes already-computed pillar signals as *inputs* and owns the
enforcement *decision* through explicit, reproducible rules. It does not re-evaluate
content, does not call any model, and performs no network I/O on the decision path.

Public surface::

    from src.policy import (
        PolicyEngine, Policy, Rule,
        Action, Severity, FailMode, EnforcementMode,
        SignalContext,
        Decision,
    )

Design guarantees (see POLICY_ENGINE.md for the auditor-facing spec):
  * Same signal context + same policy version → byte-identical decision, forever.
  * No ``eval``/``exec``/``pickle`` — conditions run in a sandboxed allowlisted AST.
  * Fail closed for ``high``/``critical`` rules when a signal is missing.
  * A skipped evaluation surfaces as ``evaluated=false`` — never as a passing score.
  * Enforcement mode (shadow / enforce / enforce_critical_only) governs *gating only*;
    the engine always evaluates, resolves, and records.
"""

from src.policy.schema import (
    Action,
    Severity,
    FailMode,
    EnforcementMode,
    Rule,
    Policy,
    PolicyError,
    EffectivePolicyMutationError,
)
from src.policy.context import SignalContext, SIGNAL_FIELDS
from src.policy.evaluator import (
    compile_condition,
    CompiledCondition,
    ConditionError,
    UnknownFieldError,
    MissingSignalError,
    ConditionRuntimeError,
)
from src.policy.resolution import resolve, ResolutionOutcome
from src.policy.engine import PolicyEngine, Decision, RuleEvaluation

__all__ = [
    "Action",
    "Severity",
    "FailMode",
    "EnforcementMode",
    "Rule",
    "Policy",
    "PolicyError",
    "EffectivePolicyMutationError",
    "SignalContext",
    "SIGNAL_FIELDS",
    "compile_condition",
    "CompiledCondition",
    "ConditionError",
    "UnknownFieldError",
    "MissingSignalError",
    "ConditionRuntimeError",
    "resolve",
    "ResolutionOutcome",
    "PolicyEngine",
    "Decision",
    "RuleEvaluation",
]
