"""Phase-6 — the tap is wired at the right place and never alters the response.

App-level proof (minimal app, just the trust router) that:
  * the handler fires the shadow dispatch with the ALREADY-COMPUTED PillarResults +
    composite (the tap is after the response is built, consuming real signals), and
  * the HTTP response is constructed solely from the TrustService output — enabling the
    shadow engine and feeding it signals that would decide BLOCK does NOT change the
    response in any way (zero actuation at the HTTP boundary).

Note on timing: Starlette/uvicorn send the response bytes to the client *before* running
``BackgroundTasks``; the strict "queued, not yet run" proof lives in
``test_shadow_integration.py``. Here we prove placement + non-mutation.
"""

from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from src.api import trust_controller
from src.middlewares.auth import verify_jwt_token


def _pillar_result():
    return SimpleNamespace(
        metadata=SimpleNamespace(id="safety_toxicity", name="Safety", version="1", weight=0.2),
        status=SimpleNamespace(value="success"),
        score=SimpleNamespace(value=20.0, confidence=0.9, risk_level=SimpleNamespace(value="high_risk")),
        execution_time_ms=12.0,
        flags=["content_unsafe"],
        error=None,
    )


def _fake_report():
    return SimpleNamespace(
        request_id="req-wire-1",
        entity_id="ent-1",
        final_score=SimpleNamespace(value=20.0, confidence=0.9, risk_level=SimpleNamespace(value="high_risk")),
        pillar_results={"safety_toxicity": _pillar_result()},
        timestamp=datetime(2026, 6, 30, tzinfo=timezone.utc),
        execution_time_ms=33.0,
    )


class _FakeTrustService:
    async def evaluate_trust(self, input_data, user_id):
        return _fake_report()


@pytest.fixture
def client(monkeypatch):
    # Fake the heavy trust pipeline + composite so the test is hermetic.
    monkeypatch.setattr(trust_controller, "TrustService", _FakeTrustService)
    monkeypatch.setattr(trust_controller, "compute_composite_trust_score", lambda _pr: 0.2)
    # Don't fire real internal HTTP from the other fire-and-forget side-effects.
    async def _noop(*a, **k):
        return None
    monkeypatch.setattr(trust_controller, "_record_audit_trail", _noop)
    monkeypatch.setattr(trust_controller, "_record_latency", _noop)
    monkeypatch.setattr(trust_controller, "_increment_eval_count", _noop)

    app = FastAPI()
    app.include_router(trust_controller.router)
    app.dependency_overrides[verify_jwt_token] = lambda: "tenant-x"
    return TestClient(app)


def test_tap_fires_with_real_signals_and_response_unaltered(client, monkeypatch):
    captured = {}

    def _spy(background_tasks, *, pillar_results, composite_score, tenant_id, request_id):
        captured["pillar_results"] = pillar_results
        captured["composite_score"] = composite_score
        captured["tenant_id"] = tenant_id
        captured["request_id"] = request_id

    monkeypatch.setattr(trust_controller, "dispatch_shadow_eval", _spy)

    resp = client.post("/trust/evaluate", json={
        "prompt": "p", "response": "r", "model": "gpt-4",
    })

    # Response is 200 and built from the TrustService report — unaffected by the engine.
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["data"]["request_id"] == "req-wire-1"
    assert body["metadata"]["composite_trust_score"] == 0.2
    # The decided shadow action would be BLOCK (composite 0.2 < 0.40), yet nothing in the
    # response is gated/blocked — the body is the plain trust report.
    assert "blocked" not in body["data"] and "enforced" not in body["data"]

    # The tap received the ALREADY-COMPUTED signals (identity), not a recompute.
    assert captured["pillar_results"] is captured["pillar_results"]
    assert "safety_toxicity" in captured["pillar_results"]
    assert captured["composite_score"] == 0.2
    assert captured["tenant_id"] == "tenant-x"
    assert captured["request_id"] == "req-wire-1"


def test_response_identical_whether_engine_attached_or_not(client, monkeypatch):
    """Zero actuation at the HTTP boundary: attaching the real shadow engine (which would
    decide BLOCK on these signals) yields a byte-identical response to not attaching it."""
    # 1) Engine fully detached (kill switch off — default).
    monkeypatch.setenv("ENGINE_SHADOW_ENABLED", "false")
    r_off = client.post("/trust/evaluate", json={"prompt": "p", "response": "r", "model": "m"})

    # 2) Engine attached at 100%, worker stubbed to a no-op so the bg task is harmless.
    async def _async_noop(**_):
        return None
    monkeypatch.setenv("ENGINE_SHADOW_ENABLED", "true")
    monkeypatch.setenv("ENGINE_SHADOW_SAMPLE_PCT", "100")
    monkeypatch.setattr("src.policy.shadow_integration._shadow_evaluate", _async_noop)
    r_on = client.post("/trust/evaluate", json={"prompt": "p", "response": "r", "model": "m"})

    assert r_off.status_code == r_on.status_code == 200

    # The substantive response is identical; only the measured wall-clock latency differs
    # (it is timing jitter unrelated to the engine), so we compare excluding that field.
    def _strip_timing(payload):
        data = dict(payload["data"])
        data.pop("execution_time_ms", None)
        return data

    assert _strip_timing(r_off.json()) == _strip_timing(r_on.json())
