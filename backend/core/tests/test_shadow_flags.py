"""Phase-6 closeout — TRUE hot-detach: the runtime flag store.

These prove the two halves of the closeout's Fix 1, WITHOUT a live stack:

  * the kill switch + sample gate are **runtime flags** in core's existing Redis
    (fakeredis here — same ``redis.asyncio`` API), and a flip changes dispatch
    behavior **in the same process, with no restart** (the thing the old env-only
    mechanism could not do);
  * flips **propagate within one cache TTL** to processes that did not perform the
    flip (stale-while-revalidate, never a request-path await);
  * **in-flight drain**: flipping OFF halts new dispatch immediately while
    evaluations already in flight complete harmlessly (``enforced:false`` structural)
    — neither path touches a request;
  * **fail-safe**: a flag-store outage forces the DETACHED posture (never attached),
    is visible as the ``skipped_failsafe`` outcome, and recovers automatically;
  * the authenticated ``/internal/shadow-flags`` control flips it over HTTP;
  * the flag read adds ~0 request-path cost (micro-benchmark + the existing
    impact-guard tests re-assert the full dispatch path).

Default posture is unchanged: no Redis keys + no env = OFF / 0 %.
"""

from __future__ import annotations

import asyncio
import time
from types import SimpleNamespace

import pytest
from fastapi import BackgroundTasks, FastAPI
from fastapi.testclient import TestClient

from src.policy import runtime, shadow_flags as sf, shadow_integration as si
from src.telemetry import policy_metrics as metrics


# ── helpers ─────────────────────────────────────────────────────────────────────

def pillar(score, risk, status="success", method="nim_api"):
    return SimpleNamespace(
        status=SimpleNamespace(value=status),
        score=SimpleNamespace(value=score, confidence=0.9, risk_level=None),
        details={"method": method, "nim_risk_score": risk},
        flags=[], execution_time_ms=12.0, error=None,
    )


class FakeResponse:
    def __init__(self, status_code=201, json_body=None, text=""):
        self.status_code = status_code
        self._json = json_body or {}
        self.text = text

    def json(self):
        return self._json


@pytest.fixture
def flag_redis(monkeypatch):
    """Inject an in-process Redis (same redis.asyncio API) as the flag store."""
    from fakeredis import aioredis as fakeaioredis
    client = fakeaioredis.FakeRedis(decode_responses=True)
    monkeypatch.setattr(sf, "_client", client)
    return client


@pytest.fixture
def outcomes(monkeypatch):
    seen = []
    monkeypatch.setattr(metrics, "record_shadow_outcome", lambda o: seen.append(o))
    return seen


@pytest.fixture(autouse=True)
def _no_env_flags(monkeypatch):
    """Start every test from the true first-run posture (no env, no keys)."""
    monkeypatch.delenv("ENGINE_SHADOW_ENABLED", raising=False)
    monkeypatch.delenv("ENGINE_SHADOW_SAMPLE_PCT", raising=False)


def dispatch(bt=None):
    bt = bt if bt is not None else BackgroundTasks()
    si.dispatch_shadow_eval(
        bt, pillar_results={"safety_toxicity": pillar(95, 0.05)},
        composite_score=0.9, tenant_id="t1", request_id="r-flag",
    )
    return bt


# ═══════════════════════════════════════════════════════════════════════════════
#  1. The flip is a runtime act — same process, NO restart
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_flip_on_then_off_changes_dispatch_without_restart(flag_redis, outcomes, monkeypatch):
    monkeypatch.setattr(si, "_shadow_evaluate", lambda **_: None)

    # Attach at 100% via the runtime flag (env untouched, still absent):
    await sf.set_flags(enabled=True, sample_pct=100)
    assert len(dispatch().tasks) == 1
    assert outcomes[-1] == "dispatched"

    # Flip OFF — same process, no restart, no env change, no recreate:
    await sf.set_flags(enabled=False)
    assert len(dispatch().tasks) == 0
    assert outcomes[-1] == "skipped_kill_switch"

    # Flip back ON — re-attaches, still no restart:
    await sf.set_flags(enabled=True)
    assert len(dispatch().tasks) == 1
    assert outcomes[-1] == "dispatched"


@pytest.mark.asyncio
async def test_flip_by_external_writer_propagates_within_ttl(flag_redis, monkeypatch):
    """A flip performed by ANOTHER process (raw Redis write, no local refresh call)
    must take effect here within one cache TTL — the documented propagation bound."""
    monkeypatch.setenv("ENGINE_SHADOW_FLAG_CACHE_TTL_S", "0.05")
    await sf.set_flags(enabled=True, sample_pct=100)
    assert sf.current_flags().enabled is True

    # External writer (e.g. another worker's endpoint, or redis-cli):
    await flag_redis.set(sf.KEY_ENABLED, "0")
    t_flip = time.monotonic()

    # Still attached until the TTL lapses (stale-while-revalidate, no request blocks):
    assert sf.current_flags().enabled is True

    while sf.current_flags().enabled and time.monotonic() - t_flip < 2.0:
        await asyncio.sleep(0.01)  # let the scheduled refresh land

    assert sf.current_flags().enabled is False
    assert time.monotonic() - t_flip < 1.0  # comfortably within TTL + one redis read


@pytest.mark.asyncio
async def test_absent_keys_fall_back_to_env_defaults(flag_redis, monkeypatch):
    """Runtime keys absent → env config rules (static baseline), resolved via redis."""
    monkeypatch.setenv("ENGINE_SHADOW_ENABLED", "true")
    monkeypatch.setenv("ENGINE_SHADOW_SAMPLE_PCT", "25")
    state = await sf.refresh()
    assert state == sf.FlagState(True, 25.0, "redis")

    # And a present key OVERRIDES env (the runtime flag is authoritative):
    await flag_redis.set(sf.KEY_ENABLED, "0")
    state = await sf.refresh()
    assert state.enabled is False and state.sample_pct == 25.0


@pytest.mark.asyncio
async def test_first_run_posture_unchanged(flag_redis):
    """No keys + no env = OFF / 0%. The mechanism changed; the safe default did not."""
    state = await sf.refresh()
    assert state.enabled is False and state.sample_pct == 0.0


@pytest.mark.asyncio
async def test_garbage_flag_values_are_safe(flag_redis):
    await flag_redis.mset({sf.KEY_ENABLED: "banana", sf.KEY_SAMPLE_PCT: "garbage"})
    state = await sf.refresh()
    assert state.enabled is False          # unknown truthiness → off
    assert state.sample_pct == 0.0         # unparseable pct → 0
    await flag_redis.set(sf.KEY_SAMPLE_PCT, "250")
    assert (await sf.refresh()).sample_pct == 100.0  # clamped


# ═══════════════════════════════════════════════════════════════════════════════
#  2. Hot-detach = new-dispatch halts + in-flight drains; no request touched
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_flip_off_halts_new_dispatch_and_drains_in_flight(flag_redis, outcomes, monkeypatch):
    """The full detach semantics: at flip time, evaluations already in flight complete
    harmlessly (out-of-band + enforced:false — completing touches no request), while
    every subsequent dispatch is halted. Nothing raises, nothing is torn."""
    posts = []

    class SlowClient:
        async def get(self, url, params=None):
            return FakeResponse(404, {})  # mode → shadow

        async def post(self, url, json=None):
            await asyncio.sleep(0.15)     # keep the eval in flight across the flip
            posts.append(json)
            return FakeResponse(201)

    monkeypatch.setattr(si, "get_shadow_client", lambda: SlowClient())
    await sf.set_flags(enabled=True, sample_pct=100)

    # Requests arrive; their evals go in flight (simulating the post-response workers):
    in_flight = [
        asyncio.create_task(si._shadow_evaluate(
            pillar_results={"safety_toxicity": pillar(95, 0.05)},
            composite_score=0.9, tenant_id="t1", request_id=f"r-drain-{i}",
        ))
        for i in range(3)
    ]
    await asyncio.sleep(0.02)  # they are now mid-write, before the flip

    # FLIP OFF mid-stream:
    await sf.set_flags(enabled=False)

    # (a) New dispatch halts immediately:
    assert len(dispatch().tasks) == 0
    assert outcomes[-1] == "skipped_kill_switch"

    # (b) In-flight evals drain cleanly — complete, recorded, still non-enforcing:
    await asyncio.gather(*in_flight)
    assert len(posts) == 3
    for body in posts:
        rec = body["metadata"]
        assert rec["enforced"] is False and rec["actuated"] is False
        assert rec["integration"] == "shadow"
    assert outcomes.count("written") == 3
    assert "worker_exception" not in outcomes


# ═══════════════════════════════════════════════════════════════════════════════
#  3. Fail-safe — a flag-store outage can only ever DETACH
# ═══════════════════════════════════════════════════════════════════════════════

class DeadRedis:
    """Every operation fails — the flag store is down."""

    async def mget(self, *keys):
        raise ConnectionError("redis unreachable")

    async def mset(self, mapping):
        raise ConnectionError("redis unreachable")

    async def delete(self, *keys):
        raise ConnectionError("redis unreachable")

    async def aclose(self):
        pass


@pytest.mark.asyncio
async def test_redis_unreachable_fails_to_detached_even_if_env_says_on(outcomes, monkeypatch):
    """The store being down must NEVER leave the engine attached — not even when the
    env default (or the last-known flag) said attached."""
    monkeypatch.setenv("ENGINE_SHADOW_ENABLED", "true")     # env would attach…
    monkeypatch.setenv("ENGINE_SHADOW_SAMPLE_PCT", "100")
    monkeypatch.setattr(sf, "_client", DeadRedis())

    state = await sf.refresh()
    assert state == sf.FlagState(False, 0.0, "failsafe")    # …but fail-safe detaches

    # And the dispatch gate records the fail-safe posture as its own metric outcome:
    dispatch()
    assert outcomes[-1] == "skipped_failsafe"


@pytest.mark.asyncio
async def test_failsafe_supersedes_last_known_attached_state(flag_redis, monkeypatch):
    """Attached via flag → store dies → next refresh forces detached (no stale attach)."""
    await sf.set_flags(enabled=True, sample_pct=100)
    assert sf.current_flags().enabled is True
    monkeypatch.setattr(sf, "_client", DeadRedis())
    await sf.refresh()
    assert sf.current_flags() == sf.FlagState(False, 0.0, "failsafe")


@pytest.mark.asyncio
async def test_failsafe_recovers_when_store_returns(flag_redis, monkeypatch):
    await flag_redis.mset({sf.KEY_ENABLED: "1", sf.KEY_SAMPLE_PCT: "50"})
    live = sf._client
    monkeypatch.setattr(sf, "_client", DeadRedis())
    assert (await sf.refresh()).source == "failsafe"

    monkeypatch.setattr(sf, "_client", live)                # store comes back
    state = await sf.refresh()
    assert state == sf.FlagState(True, 50.0, "redis")       # re-attaches automatically


# ═══════════════════════════════════════════════════════════════════════════════
#  4. The flag read adds ~0 request-path cost
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_flag_read_is_microseconds(flag_redis):
    """current_flags() is the only new request-path work; it must be a cached local
    read. 10k reads in well under a second ⇒ single-digit microseconds each."""
    await sf.set_flags(enabled=True, sample_pct=100)
    t0 = time.perf_counter()
    for _ in range(10_000):
        sf.current_flags()
    elapsed = time.perf_counter() - t0
    assert elapsed < 0.5, f"10k flag reads took {elapsed:.3f}s — not a cached read"


# ═══════════════════════════════════════════════════════════════════════════════
#  5. The authenticated /internal/shadow-flags control
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.fixture
def control_client(monkeypatch):
    from src.api.internal import router as internal_router
    monkeypatch.setenv("VELDRIX_INTERNAL_API_KEY", "sekrit")
    app = FastAPI()
    app.include_router(internal_router)
    return TestClient(app)


AUTH = {"X-Veldrix-Internal-Key": "sekrit"}


def test_flip_endpoint_requires_auth(control_client, flag_redis):
    assert control_client.post("/internal/shadow-flags", json={"enabled": True}).status_code == 403
    assert control_client.get("/internal/shadow-flags").status_code == 403
    assert control_client.delete("/internal/shadow-flags").status_code == 403


def test_flip_endpoint_flips_and_reports(control_client, flag_redis, monkeypatch):
    r = control_client.post(
        "/internal/shadow-flags", json={"enabled": True, "sample_pct": 25}, headers=AUTH
    )
    assert r.status_code == 200
    body = r.json()
    assert body["enabled"] is True and body["sample_pct"] == 25.0
    assert body["source"] == "redis"
    assert body["max_propagation_s"] <= 5.5  # TTL + redis timeout, documented bound

    r = control_client.get("/internal/shadow-flags", headers=AUTH)
    assert r.json()["enabled"] is True

    # Kill switch over HTTP:
    r = control_client.post("/internal/shadow-flags", json={"enabled": False}, headers=AUTH)
    assert r.json()["enabled"] is False and r.json()["sample_pct"] == 25.0

    # Clear → env defaults (none set here) rule again:
    r = control_client.delete("/internal/shadow-flags", headers=AUTH)
    assert r.status_code == 200
    assert r.json()["enabled"] is False and r.json()["sample_pct"] == 0.0


def test_flip_endpoint_validates(control_client, flag_redis):
    assert control_client.post("/internal/shadow-flags", json={}, headers=AUTH).status_code == 400
    assert control_client.post(
        "/internal/shadow-flags", json={"sample_pct": 250}, headers=AUTH
    ).status_code == 422  # pydantic bound, not silent clamping at the control surface


def test_flip_endpoint_store_down_is_503_and_failsafe(control_client, monkeypatch):
    monkeypatch.setattr(sf, "_client", DeadRedis())
    r = control_client.post("/internal/shadow-flags", json={"enabled": True}, headers=AUTH)
    assert r.status_code == 503
    assert "DETACHED" in r.json()["detail"]
    # GET reports the honest failsafe posture rather than erroring:
    r = control_client.get("/internal/shadow-flags", headers=AUTH)
    assert r.status_code == 200
    body = r.json()
    assert body["enabled"] is False and body["source"] == "failsafe"
