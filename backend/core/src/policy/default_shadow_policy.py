"""The bundled default *shadow* policy for the Phase-6 dev engine integration.

RECON-INT.md (Finding #5 / core-tap C-3) established there is **no production policy
loader** — ``Policy`` has no ``from_dict``/``from_yaml`` and the connectors
``policy_documents`` migrations are unapplied. So the dev shadow integration evaluates
against a single, **code-constructed, versioned, checksummed** default policy defined
here. It is the single source of truth for "what would the engine decide on real dev
traffic" and nothing else constructs a policy for the shadow path.

Design notes:

  * Every condition is valid against :data:`src.policy.context.SIGNAL_FIELDS` and is
    written to short-circuit safely (the evaluator short-circuits ``and``/``or``), so a
    missing/unevaluated pillar signal never *manufactures* a gating decision — an
    ``*_evaluated == True`` guard precedes any reference to that pillar's risk.
  * ``composite_score`` is always supplied on the live ``/trust/evaluate`` path
    (``trust_controller`` passes it as signal metadata), so the composite rules can rely
    on it; the critical composite rule still fails CLOSED if it is ever absent — a
    missing critical signal can never read as a pass.
  * This policy *gates nothing* in this phase regardless of its rules: the integration
    forces ``enforced:false`` on every record and there is no response-path runtime. The
    rules exist to produce a realistic "what would be decided" distribution for the
    shadow-on-dev-traffic panel.

The policy is constructed once at import and cached; ``get_default_shadow_policy()``
returns the same immutable instance every call (its ``(policy_id, version, checksum)``
triple is therefore stable across a process and reproducible across deploys).
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from src.policy.schema import Action, FailMode, Policy, Rule, Severity

# A fixed, deterministic authoring timestamp. The checksum deliberately EXCLUDES
# timestamps (see Policy._compute_checksum), but pinning it keeps the audit record's
# created_at stable and makes the policy a permanent, addressable artifact.
_AUTHORED_AT = datetime(2026, 6, 30, 0, 0, 0, tzinfo=timezone.utc)

POLICY_ID = "veldrix.default.shadow"
POLICY_VERSION = 1

_RULES = (
    # ── Critical hard-stops (would BLOCK under enforce; only recorded here) ────────
    Rule(
        id="block_prompt_injection",
        condition="prompt_security_evaluated == True and prompt_security_risk >= 0.85",
        description="Prompt-security pillar assessed a high-confidence injection/exfiltration risk.",
        action=Action.BLOCK,
        severity=Severity.CRITICAL,
        priority=100,
        fail_mode=FailMode.FAIL_OPEN,  # guarded by *_evaluated; a missing signal must not fabricate a block
    ),
    Rule(
        id="block_low_composite_trust",
        condition="composite_score < 0.40",
        description="Aggregate trust is below the hard-block floor.",
        action=Action.BLOCK,
        severity=Severity.CRITICAL,
        priority=90,
        # composite is supplied on the live path; if ever absent, fail CLOSED (never a silent pass).
        fail_mode=FailMode.FAIL_CLOSED,
    ),
    # ── High-severity escalations (human-in-the-loop under enforce) ────────────────
    Rule(
        id="escalate_unsafe_content",
        condition="safety_evaluated == True and safety_risk >= 0.70",
        description="Safety/toxicity pillar assessed a high risk.",
        action=Action.ESCALATE,
        severity=Severity.HIGH,
        priority=70,
        fail_mode=FailMode.FAIL_OPEN,
    ),
    Rule(
        id="escalate_compliance_risk",
        condition="compliance_evaluated == True and compliance_risk >= 0.70",
        description="Compliance/policy pillar assessed a high regulatory risk.",
        action=Action.ESCALATE,
        severity=Severity.HIGH,
        priority=65,
        fail_mode=FailMode.FAIL_OPEN,
    ),
    # ── Soft, non-gating verbs (record intent; never gate even under enforce) ──────
    Rule(
        id="disclaimer_mid_composite",
        condition="composite_score < 0.60",
        description="Moderate aggregate trust — would attach a disclaimer.",
        action=Action.DISCLAIMER,
        severity=Severity.MEDIUM,
        priority=40,
        fail_mode=FailMode.FAIL_OPEN,
    ),
    Rule(
        id="disclaimer_hallucination",
        condition="hallucination_evaluated == True and hallucination_risk >= 0.60",
        description="Hallucination pillar assessed an elevated grounding risk.",
        action=Action.DISCLAIMER,
        severity=Severity.MEDIUM,
        priority=35,
        fail_mode=FailMode.FAIL_OPEN,
    ),
)

_POLICY: Optional[Policy] = None


def get_default_shadow_policy() -> Policy:
    """Return the process-wide bundled default shadow policy (constructed once)."""
    global _POLICY
    if _POLICY is None:
        _POLICY = Policy(
            policy_id=POLICY_ID,
            version=POLICY_VERSION,
            created_by="veldrix.phase6.shadow_integration",
            created_at=_AUTHORED_AT,
            effective_at=_AUTHORED_AT,
            default_action=Action.ALLOW,  # no rule matched → allow (shadow gates nothing anyway)
            rules=_RULES,
        )
    return _POLICY
