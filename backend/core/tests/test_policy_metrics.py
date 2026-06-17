"""Policy runtime metrics — registration + the no-PII guarantee (Part B / B.2).

The hard observability constraint: metrics expose counts, latencies, verbs, modes,
pillar ids, and provider tiers — and **never** governed content / PII. These tests
drive the runtime with a payload carrying obvious PII markers, then scan the rendered
Prometheus exposition to prove none of it leaked into telemetry.
"""

from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from src.policy import Action, EnforcementMode, Policy, Rule, Severity
from src.policy import runtime
from src.policy.runtime import evaluate
from src.telemetry import policy_metrics as metrics

_NOW = datetime(2026, 6, 16, tzinfo=timezone.utc)

# Obvious PII tokens that MUST NOT appear anywhere in the metrics exposition.
PII_TOKENS = ["jane.doe@example.com", "555-12-3456", "tenant-secret-xyz", "wire_transfer_to_acct"]


def _policy() -> Policy:
    return Policy(
        policy_id="pol_metrics", version=1, created_by="t",
        created_at=_NOW, effective_at=_NOW, default_action=Action.ALLOW,
        rules=(Rule("r", "bias_score < 40", "blk", Action.BLOCK, Severity.CRITICAL),),
    )


def _bias(score):
    return SimpleNamespace(
        status=SimpleNamespace(value="success"),
        score=SimpleNamespace(value=score),
        details={"method": "nim_api", "nim_risk_score": 1 - score / 100, "note": PII_TOKENS[3]},
        flags=[],
    )


@pytest.fixture(autouse=True)
def _hermetic_breaker(monkeypatch):
    async def _closed():
        return {}
    monkeypatch.setattr("src.inference.circuit_breaker.async_get_all_states", _closed)
    runtime.configure(max_concurrent=64)


@pytest.mark.asyncio
async def test_metrics_render_and_record_decisions():
    async def collector(partial):
        partial["bias_fairness"] = _bias(10.0)

    await evaluate(
        policy=_policy(),
        signal_collector=collector,
        tenant_id=PII_TOKENS[2],
        request_id="req-1",
        mode=EnforcementMode.ENFORCE,
        audit_sink=lambda rec: None,
    )
    body, content_type = metrics.render()
    text = body.decode("utf-8")

    if not metrics.PROMETHEUS_AVAILABLE:
        pytest.skip("prometheus_client not installed; metrics are no-ops in this env")

    # The metric families exist and a decision was counted.
    assert "veldrix_policy_decisions_total" in text
    assert "veldrix_policy_eval_latency_seconds" in text
    assert 'action="block"' in text and 'mode="enforce"' in text


@pytest.mark.asyncio
async def test_no_pii_in_metrics_exposition():
    async def collector(partial):
        partial["bias_fairness"] = _bias(95.0)

    await evaluate(
        policy=_policy(),
        signal_collector=collector,
        tenant_id=PII_TOKENS[2],
        signal_metadata={"region": "EU", "action_class": PII_TOKENS[3],
                         "data_categories": ["pii", "phi"]},
        request_id="req-pii",
        mode=EnforcementMode.SHADOW,
        audit_sink=lambda rec: None,
    )
    body, _ = metrics.render()
    text = body.decode("utf-8")
    for token in PII_TOKENS:
        assert token not in text, f"PII token leaked into metrics: {token!r}"


def test_metric_helpers_are_safe_without_labels():
    """The thin helpers must never raise (no-op path included)."""
    metrics.observe_eval_latency(0.01)
    metrics.observe_phase("collect", 0.001)
    metrics.record_decision("allow", "shadow", False)
    metrics.record_fail_mode("timeout_budget")
    metrics.record_pillar_unevaluated("bias")
    metrics.record_engine_error()
    metrics.record_provider_fallback("nvidia_nim")
    metrics.record_shed()
    body, ct = metrics.render()
    assert isinstance(body, (bytes, bytearray))
    assert "text/plain" in ct
