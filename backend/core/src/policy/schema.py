"""Policy definition schema — policies and rules as immutable, versioned data.

A policy is *data, not code*. It carries an ordered set of rules; each rule has a
deterministic boolean ``condition`` (see :mod:`src.policy.evaluator`) over a typed
signal context, and exactly one of the seven enforcement verbs as its ``action``.

Immutability
------------
``Rule`` and ``Policy`` are frozen dataclasses. Once a ``Policy`` is constructed it
cannot be mutated in place — any attribute assignment raises
:class:`EffectivePolicyMutationError`. A change to an effective policy is expressed
as a *new version* via :meth:`Policy.new_version`, which bumps ``version`` and
recomputes the ``checksum``. This is the enterprise change-control guarantee: an
effective policy is a permanent, addressable artifact.

Determinism
-----------
``checksum`` is a SHA-256 over a canonical, ordering-stable serialization of the
policy's decision-relevant fields. The same logical policy always produces the same
checksum, so an audit record's ``(policy_id, version, checksum)`` triple proves
exactly which rules ran.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, Optional, Tuple


# ═══════════════════════════════════════════════════════════════════════════════
#  ERRORS
# ═══════════════════════════════════════════════════════════════════════════════


class PolicyError(ValueError):
    """Base class for policy *definition* errors (raised at construction/load)."""


class EffectivePolicyMutationError(PolicyError):
    """Raised when code attempts to mutate an effective (frozen) policy in place."""


# ═══════════════════════════════════════════════════════════════════════════════
#  ENUMS  (ordering encodes precedence — see resolution.py)
# ═══════════════════════════════════════════════════════════════════════════════


class Action(str, Enum):
    """The seven enforcement verbs. ``value`` is the stable wire/audit string."""

    ALLOW = "allow"
    BLOCK = "block"
    REWRITE = "rewrite"
    MASK = "mask"
    DISCLAIMER = "disclaimer"
    ESCALATE = "escalate"
    REGENERATE = "regenerate"


# Restrictiveness ranking for the §2.3 tie-break (higher = more restrictive wins).
# block > escalate > regenerate > rewrite > mask > disclaimer > allow
_RESTRICTIVENESS: Dict["Action", int] = {
    Action.BLOCK: 6,
    Action.ESCALATE: 5,
    Action.REGENERATE: 4,
    Action.REWRITE: 3,
    Action.MASK: 2,
    Action.DISCLAIMER: 1,
    Action.ALLOW: 0,
}


def action_restrictiveness(action: "Action") -> int:
    """Return the restrictiveness rank of an action (higher = more restrictive)."""
    return _RESTRICTIVENESS[action]


class Severity(str, Enum):
    """Rule severity. Drives the first (highest-priority) resolution tie-break."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


_SEVERITY_RANK: Dict["Severity", int] = {
    Severity.LOW: 0,
    Severity.MEDIUM: 1,
    Severity.HIGH: 2,
    Severity.CRITICAL: 3,
}


def severity_rank(severity: "Severity") -> int:
    """Return the numeric rank of a severity (higher = more severe)."""
    return _SEVERITY_RANK[severity]


class FailMode(str, Enum):
    """What a rule does when its condition cannot be evaluated (missing signal,
    unknown field, runtime error)."""

    FAIL_OPEN = "fail_open"      # rule treated as non-firing
    FAIL_CLOSED = "fail_closed"  # rule treated as firing with a worst-case action


class EnforcementMode(str, Enum):
    """Per-tenant gating mode (§2.8). The engine ALWAYS evaluates/resolves/records;
    mode governs only whether the resolved decision is returned as *gating*."""

    SHADOW = "shadow"                              # decide + record, enforced=false, gates nothing
    ENFORCE = "enforce"                            # block/escalate gate, enforced=true
    ENFORCE_CRITICAL_ONLY = "enforce_critical_only"  # gate critical only; shadow the rest


# The default for EVERY tenant. Enforcement is strictly opt-in: a fresh tenant
# cannot gate production traffic without an explicit mode change.
DEFAULT_ENFORCEMENT_MODE = EnforcementMode.SHADOW


# ═══════════════════════════════════════════════════════════════════════════════
#  RULE
# ═══════════════════════════════════════════════════════════════════════════════


@dataclass(frozen=True)
class Rule:
    """A single declarative enforcement rule.

    Attributes:
        id: Stable unique identifier (shown to auditors).
        condition: Deterministic boolean expression over the signal context
            (see :mod:`src.policy.evaluator` for the grammar).
        description: Human-readable explanation (shown to auditors).
        action: Exactly one of the seven enforcement verbs.
        severity: low | medium | high | critical.
        priority: Integer for explicit author tie-break override (higher wins).
        fail_mode: What to do when the condition cannot be evaluated. If omitted,
            defaults to ``fail_closed`` for high/critical severity, else ``fail_open``.
    """

    id: str
    condition: str
    description: str
    action: Action
    severity: Severity
    priority: int = 0
    fail_mode: Optional[FailMode] = None

    def __post_init__(self) -> None:
        if not self.id or not isinstance(self.id, str):
            raise PolicyError("Rule.id must be a non-empty string")
        if not isinstance(self.condition, str) or not self.condition.strip():
            raise PolicyError(f"Rule {self.id!r}: condition must be a non-empty string")
        if not isinstance(self.action, Action):
            raise PolicyError(f"Rule {self.id!r}: action must be an Action enum")
        if not isinstance(self.severity, Severity):
            raise PolicyError(f"Rule {self.id!r}: severity must be a Severity enum")
        if not isinstance(self.priority, int):
            raise PolicyError(f"Rule {self.id!r}: priority must be an int")
        # Resolve the effective fail_mode deterministically and freeze it on the rule
        # so the audit record always reflects the actual mode used (never an implicit one).
        if self.fail_mode is None:
            resolved = (
                FailMode.FAIL_CLOSED
                if self.severity in (Severity.HIGH, Severity.CRITICAL)
                else FailMode.FAIL_OPEN
            )
            object.__setattr__(self, "fail_mode", resolved)
        elif not isinstance(self.fail_mode, FailMode):
            raise PolicyError(f"Rule {self.id!r}: fail_mode must be a FailMode enum")

    def canonical(self) -> Dict[str, Any]:
        """Ordering-stable dict used for checksum + audit. Pure data, no objects."""
        return {
            "id": self.id,
            "description": self.description,
            "condition": self.condition,
            "action": self.action.value,
            "severity": self.severity.value,
            "priority": self.priority,
            "fail_mode": self.fail_mode.value if self.fail_mode else None,
        }


# ═══════════════════════════════════════════════════════════════════════════════
#  POLICY
# ═══════════════════════════════════════════════════════════════════════════════


@dataclass
class Policy:
    """A versioned, immutable policy document.

    Attributes:
        policy_id: Stable identifier for the policy across versions.
        version: Monotonic version integer (a change → a new version).
        created_by: Author identity (shown to auditors).
        created_at: When this version was authored.
        effective_at: When this version becomes active for resolution.
        default_action: Returned when NO rule matches. Author-defined; for regulated
            tenants this should be ``escalate`` or ``block`` — never a silent allow.
        rules: Ordered tuple of rules (document order is the final tie-break).
        checksum: SHA-256 over the canonical serialization. Auto-computed if omitted;
            if supplied it is verified and a mismatch raises (tamper detection).
    """

    policy_id: str
    version: int
    created_by: str
    created_at: datetime
    effective_at: datetime
    default_action: Action
    rules: Tuple[Rule, ...] = ()
    checksum: str = ""

    def __post_init__(self) -> None:
        if not self.policy_id or not isinstance(self.policy_id, str):
            raise PolicyError("Policy.policy_id must be a non-empty string")
        if not isinstance(self.version, int) or self.version < 1:
            raise PolicyError("Policy.version must be a positive integer (monotonic)")
        if not isinstance(self.default_action, Action):
            raise PolicyError("Policy.default_action must be an Action enum")
        if not isinstance(self.rules, tuple):
            # Accept any sequence at construction, but store an immutable tuple.
            object.__setattr__(self, "rules", tuple(self.rules))
        # Reject duplicate rule ids — they would make audit reasoning ambiguous.
        seen = set()
        for r in self.rules:
            if not isinstance(r, Rule):
                raise PolicyError("Policy.rules must contain only Rule instances")
            if r.id in seen:
                raise PolicyError(f"Duplicate rule id in policy: {r.id!r}")
            seen.add(r.id)

        computed = self._compute_checksum()
        if self.checksum:
            if self.checksum != computed:
                raise PolicyError(
                    f"Policy checksum mismatch for {self.policy_id} v{self.version}: "
                    f"supplied={self.checksum} computed={computed}"
                )
        else:
            object.__setattr__(self, "checksum", computed)

        # Lock the instance: from here on, any attribute set/delete raises a
        # domain-specific error. (We can't use frozen=True because it would inject
        # its own __setattr__ and we want the clearer EffectivePolicyMutationError.)
        object.__setattr__(self, "_locked", True)

    # ── immutability guard ────────────────────────────────────────────────────
    def __setattr__(self, name: str, value: Any) -> None:
        if getattr(self, "_locked", False):
            raise EffectivePolicyMutationError(
                f"Cannot mutate effective policy {self.policy_id} v{self.version} "
                f"(attempted to set {name!r}). Create a new version with Policy.new_version()."
            )
        object.__setattr__(self, name, value)

    def __delattr__(self, name: str) -> None:
        if getattr(self, "_locked", False):
            raise EffectivePolicyMutationError(
                f"Cannot delete attributes on effective policy {self.policy_id} v{self.version}."
            )
        object.__delattr__(self, name)

    # ── canonical form + checksum ─────────────────────────────────────────────
    def canonical(self) -> Dict[str, Any]:
        """Ordering-stable dict capturing every decision-relevant field."""
        return {
            "policy_id": self.policy_id,
            "version": self.version,
            "default_action": self.default_action.value,
            "rules": [r.canonical() for r in self.rules],
        }

    def _compute_checksum(self) -> str:
        # Note: created_by / created_at / effective_at are deliberately EXCLUDED —
        # the checksum proves the *decision logic*, not authorship metadata. Two
        # versions with identical rules but different timestamps share decision
        # behavior; the (policy_id, version) pair already disambiguates them.
        blob = json.dumps(self.canonical(), sort_keys=True, separators=(",", ":"))
        return "sha256:" + hashlib.sha256(blob.encode("utf-8")).hexdigest()

    # ── versioning ────────────────────────────────────────────────────────────
    def new_version(
        self,
        *,
        rules: Optional[Tuple[Rule, ...]] = None,
        default_action: Optional[Action] = None,
        created_by: Optional[str] = None,
        created_at: Optional[datetime] = None,
        effective_at: Optional[datetime] = None,
    ) -> "Policy":
        """Return a NEW Policy with ``version`` bumped by one and a fresh checksum.

        This is the only sanctioned way to change an effective policy. The original
        is never mutated.
        """
        now = datetime.now(timezone.utc)
        return Policy(
            policy_id=self.policy_id,
            version=self.version + 1,
            created_by=created_by if created_by is not None else self.created_by,
            created_at=created_at if created_at is not None else now,
            effective_at=effective_at if effective_at is not None else now,
            default_action=default_action if default_action is not None else self.default_action,
            rules=tuple(rules) if rules is not None else self.rules,
            checksum="",  # force recompute
        )
