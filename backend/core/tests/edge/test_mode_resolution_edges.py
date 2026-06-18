"""Edge battery — enforcement-mode resolution edge cases.

Targets the per-tenant mode gate (the highest-stakes flag): malformed/null modes,
the critical/high boundary under ``enforce_critical_only``, the cache TTL staleness
window, and the fail-safe-to-shadow invariant under lookup failure. Built against the
REAL ``mode_client`` and engine gating math.

All HELD — every degenerate mode resolves to a SAFE outcome (shadow / over-gate),
never a silent escalation into enforce.
"""

from __future__ import annotations

import pytest

from src.policy import mode_client
from src.policy.engine import _compute_enforced
from src.policy.schema import Action, EnforcementMode, Severity


# ── _coerce: malformed / null / case / type → fail-safe shadow ─────────────────

@pytest.mark.parametrize("raw,expected", [
    ("shadow", EnforcementMode.SHADOW),
    ("enforce", EnforcementMode.ENFORCE),
    ("enforce_critical_only", EnforcementMode.ENFORCE_CRITICAL_ONLY),
    (None, EnforcementMode.SHADOW),
    ("", EnforcementMode.SHADOW),
    ("ENFORCE", EnforcementMode.SHADOW),        # case-sensitive → unknown → shadow
    ("enforce ", EnforcementMode.SHADOW),       # trailing space → unknown → shadow
    ("yolo", EnforcementMode.SHADOW),
    ("enforce_all", EnforcementMode.SHADOW),
    (123, EnforcementMode.SHADOW),              # wrong type → shadow
    ({"mode": "enforce"}, EnforcementMode.SHADOW),
])
def test_coerce_fails_safe_to_shadow(raw, expected):
    assert mode_client._coerce(raw) == expected


# ── enforce_critical_only — the critical/high boundary ─────────────────────────

def test_enforce_critical_only_gates_critical_block():
    assert _compute_enforced(Action.BLOCK, Severity.CRITICAL,
                             EnforcementMode.ENFORCE_CRITICAL_ONLY) is True


def test_enforce_critical_only_does_not_gate_high_block():
    assert _compute_enforced(Action.BLOCK, Severity.HIGH,
                             EnforcementMode.ENFORCE_CRITICAL_ONLY) is False


def test_enforce_critical_only_does_not_gate_critical_nonblocking_verb():
    # mask/rewrite/etc. have no runtime yet → never enforced even at critical.
    assert _compute_enforced(Action.MASK, Severity.CRITICAL,
                             EnforcementMode.ENFORCE_CRITICAL_ONLY) is False


def test_shadow_never_gates_even_critical_block():
    assert _compute_enforced(Action.BLOCK, Severity.CRITICAL, EnforcementMode.SHADOW) is False


def test_none_severity_under_critical_only_does_not_gate():
    # default_action path has decided_severity=None → cannot be "critical" → no gate.
    assert _compute_enforced(Action.BLOCK, None,
                             EnforcementMode.ENFORCE_CRITICAL_ONLY) is False


# ── Cache TTL staleness window + fail-safe lookup ──────────────────────────────

class _Resp:
    def __init__(self, status, body):
        self.status_code, self._b = status, body

    def json(self):
        return self._b


class _Client:
    def __init__(self, resp):
        self.resp, self.calls = resp, 0

    async def get(self, url, params=None):
        self.calls += 1
        return self.resp


@pytest.fixture(autouse=True)
def _clear_cache():
    mode_client.invalidate()
    yield
    mode_client.invalidate()


@pytest.mark.asyncio
async def test_mode_is_cached_within_ttl(monkeypatch):
    client = _Client(_Resp(200, {"mode": "enforce"}))
    monkeypatch.setattr("src.core.http_pool.get_internal_client", lambda: client)
    m1 = await mode_client.get_mode("tenant-x", "p1")
    m2 = await mode_client.get_mode("tenant-x", "p1")
    assert m1 == m2 == EnforcementMode.ENFORCE
    assert client.calls == 1                      # second read served from cache (TTL)


@pytest.mark.asyncio
async def test_rollback_takes_effect_after_cache_invalidation(monkeypatch):
    """Bounded staleness: once the cache entry is dropped (TTL expiry / explicit
    invalidate), a rollback to shadow is observed. The stale direction is over-gating
    (enforce lingering), never under-gating."""
    enforce_client = _Client(_Resp(200, {"mode": "enforce"}))
    monkeypatch.setattr("src.core.http_pool.get_internal_client", lambda: enforce_client)
    assert await mode_client.get_mode("t", "p1") == EnforcementMode.ENFORCE

    # Backend rolls back to shadow; cache still holds enforce until invalidated.
    shadow_client = _Client(_Resp(200, {"mode": "shadow"}))
    monkeypatch.setattr("src.core.http_pool.get_internal_client", lambda: shadow_client)
    assert await mode_client.get_mode("t", "p1") == EnforcementMode.ENFORCE  # stale (safe: over-gates)
    mode_client.invalidate("t", "p1")
    assert await mode_client.get_mode("t", "p1") == EnforcementMode.SHADOW   # now de-gated


@pytest.mark.asyncio
async def test_lookup_failure_fails_safe_to_shadow(monkeypatch):
    class _Boom:
        async def get(self, *a, **k):
            raise RuntimeError("connectors down")

    monkeypatch.setattr("src.core.http_pool.get_internal_client", lambda: _Boom())
    assert await mode_client.get_mode("t", "p1") == EnforcementMode.SHADOW


@pytest.mark.asyncio
async def test_auth_gated_mode_endpoint_401_fails_safe_to_shadow(monkeypatch):
    """After PR-1 gated the mode-read endpoint, a misconfigured token yields 401/503;
    mode_client treats any non-200/404 as → shadow (fail-safe de-gate), never enforce."""
    monkeypatch.setattr("src.core.http_pool.get_internal_client",
                        lambda: _Client(_Resp(401, {})))
    assert await mode_client.get_mode("t", "p1") == EnforcementMode.SHADOW
