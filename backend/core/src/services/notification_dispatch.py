"""
Fire-and-forget notification dispatcher.
Called via asyncio.create_task() after enforcement resolves —
never blocks the evaluation response path.
"""

import logging
import os

from src.core.http_pool import get_internal_client
from src.services.notification_broadcaster import broadcaster

logger = logging.getLogger(__name__)

# Docker Compose hostname: veldrix-auth; local dev: localhost:8000
_AUTH_URL = os.getenv("VELDRIX_AUTH_URL", "http://localhost:8000")
_INTERNAL_KEY = os.getenv("VELDRIX_INTERNAL_API_KEY", "")

# ── Notification message templates ────────────────────────────────────────────
# Key: (enforcement_action, pillar_id)
_TEMPLATES: dict[tuple[str, str], dict] = {
    ("blocked", "safety"): {
        "title": "Request blocked — Safety pillar",
        "message": (
            "AI output contained content with high potential for real-world harm. "
            "Response was blocked before reaching the end user."
        ),
        "severity": "blocked",
    },
    ("blocked", "prompt_security"): {
        "title": "Prompt injection blocked",
        "message": (
            "A prompt injection or jailbreak attempt was detected and neutralized "
            "before the model was called."
        ),
        "severity": "blocked",
    },
    ("blocked", "compliance"): {
        "title": "Request blocked — Compliance policy",
        "message": (
            "Output violated an active compliance policy rule. "
            "Response was blocked before delivery."
        ),
        "severity": "blocked",
    },
    ("masked", "pii"): {
        "title": "PII detected and masked",
        "message": (
            "Personally identifiable information was found in model output "
            "and automatically redacted before delivery."
        ),
        "severity": "masked",
    },
    ("masked", "compliance"): {
        "title": "Compliance violation masked",
        "message": (
            "Output contained regulated or policy-sensitive data. "
            "Relevant fields were masked per your active compliance policy."
        ),
        "severity": "masked",
    },
    ("flagged", "hallucination"): {
        "title": "Hallucination detected — held for review",
        "message": (
            "Model output scored above the hallucination confidence threshold. "
            "Response held in escalation queue pending human review."
        ),
        "severity": "flagged",
    },
    ("flagged", "bias"): {
        "title": "Bias indicator flagged",
        "message": (
            "Response exhibited statistically significant bias indicators. "
            "Logged and queued for policy review."
        ),
        "severity": "flagged",
    },
    ("flagged", "safety"): {
        "title": "Safety concern flagged",
        "message": (
            "AI output raised safety concerns below the blocking threshold. "
            "Response was delivered but flagged for review."
        ),
        "severity": "flagged",
    },
    ("escalated", "compliance"): {
        "title": "Escalated to human operator",
        "message": (
            "Agent attempted an action exceeding autonomous approval thresholds. "
            "Escalated to human review queue."
        ),
        "severity": "escalated",
    },
    ("escalated", "safety"): {
        "title": "Agent action escalated — Safety",
        "message": (
            "Autonomous agent attempted a tool execution flagged as unsafe. "
            "Action suspended and escalated."
        ),
        "severity": "escalated",
    },
}

_DEFAULT_TEMPLATE = {
    "title": "Trust violation intercepted",
    "message": (
        "VeldrixAI intercepted a request that did not meet your active "
        "trust policy thresholds."
    ),
    "severity": "flagged",
}


def _build_payload(
    action: str,
    pillar: str,
    endpoint: str | None,
    model_name: str | None,
    agent_name: str | None,
    tool_name: str | None,
    audit_log_id: str | None,
    user_id: str,
) -> dict:
    tpl = _TEMPLATES.get((action.lower(), pillar.lower()), _DEFAULT_TEMPLATE)
    return {
        "user_id": user_id,
        "audit_log_id": audit_log_id,
        "severity": tpl["severity"],
        "pillar": pillar,
        "enforcement": action,
        "title": tpl["title"],
        "message": tpl["message"],
        "endpoint": endpoint,
        "model_name": model_name,
        "agent_name": agent_name,
        "tool_name": tool_name,
    }


async def dispatch_notification(
    user_id: str,
    audit_log_id: str | None,
    action: str,
    pillar: str,
    endpoint: str | None = None,
    model_name: str | None = None,
    agent_name: str | None = None,
    tool_name: str | None = None,
) -> None:
    """
    1. Build payload from template
    2. Persist to auth service via internal HTTP (veldrix-auth)
    3. Broadcast over WebSocket to all connected sessions for this user
    """
    payload = _build_payload(
        action=action,
        pillar=pillar,
        endpoint=endpoint,
        model_name=model_name,
        agent_name=agent_name,
        tool_name=tool_name,
        audit_log_id=audit_log_id,
        user_id=user_id,
    )

    saved = payload  # fallback if persistence fails
    try:
        client = get_internal_client()
        resp = await client.post(
            f"{_AUTH_URL}/notifications/internal-create",
            json=payload,
            headers={"x-internal-api-key": _INTERNAL_KEY},
        )
        resp.raise_for_status()
        saved = resp.json()
    except Exception as exc:
        logger.error("[Notifications] persist failed user=%s: %s", user_id, exc)

    try:
        await broadcaster.broadcast_to_user(user_id, {**saved, "unread_count_delta": 1})
    except Exception as exc:
        logger.error("[Notifications] WS broadcast failed user=%s: %s", user_id, exc)
