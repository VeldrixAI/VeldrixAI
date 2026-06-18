"""Domain 3.5 — WebSocket BOLA on /ws/notifications/{user_id}.
[OWASP API1:2023 BOLA — object-level authz on a real-time stream]

Closes the Phase-3 "Not reached" gap (core/src/main.py:171-205). The guarantee: the
authenticated token ``sub`` MUST equal the path ``user_id`` — otherwise a valid token
for tenant A could subscribe to tenant B's trust-violation notification stream
(cross-tenant disclosure).

How this is tested (faithful, without booting the whole app — main.py's middleware
stack requires full lifespan state that a unit test cannot stand up):
  1. The security primitive — the REAL ``verify_jwt_token`` — is exercised directly.
  2. The authz BEHAVIOR is driven through a throwaway app whose websocket handler is a
     verbatim copy of main.py's handler body, calling the REAL verifier. It asserts the
     real close codes (4001 no/invalid token, 4003 sub≠path) and a legitimate connect.
  3. A SOURCE-INTEGRITY check asserts the real main.py handler still contains the
     ``verified_user_id != user_id`` gate and the no-token close — so the behavior test
     cannot drift away from the deployed code without failing.

Result: HELD — sub==path is enforced; mismatched and unauthenticated subscriptions are
refused before the stream is joined.

``python-jose`` is a pinned dep; skips if absent.
"""

from __future__ import annotations

from pathlib import Path

import pytest

pytest.importorskip("jose")
from jose import jwt  # noqa: E402

try:
    from fastapi import FastAPI, WebSocket
    from fastapi.testclient import TestClient
    from starlette.websockets import WebSocketDisconnect
    _HTTP_OK = True
except Exception:  # pragma: no cover
    _HTTP_OK = False

pytestmark = pytest.mark.skipif(not _HTTP_OK, reason="fastapi/starlette unavailable")

SECRET = "ws-bola-secret"


def _reload_auth(monkeypatch, secret=SECRET, algorithm="HS256"):
    """Point core auth at a known secret by patching the cached Settings object.

    We monkeypatch ``settings`` attrs (NOT ``importlib.reload``) so we don't mint new
    module/function objects that could pollute other tests; monkeypatch auto-reverts."""
    import src.middlewares.auth as auth_mod
    monkeypatch.setattr(auth_mod.settings, "JWT_SECRET", secret)
    monkeypatch.setattr(auth_mod.settings, "JWT_ALGORITHM", algorithm)
    return auth_mod


def _ws_app(auth_mod):
    """Throwaway app whose handler is a verbatim copy of main.py:171-205, calling the
    REAL verify_jwt_token. No broadcaster join (we only test the authz gate)."""
    app = FastAPI()

    @app.websocket("/ws/notifications/{user_id}")
    async def notifications_ws(websocket: WebSocket, user_id: str):
        from fastapi import HTTPException

        token = websocket.query_params.get("token", "")
        if not token:
            await websocket.accept()
            await websocket.close(code=4001)
            return
        try:
            verified_user_id = await auth_mod.verify_jwt_token(authorization=f"Bearer {token}")
            if verified_user_id != user_id:
                await websocket.accept()
                await websocket.close(code=4003)
                return
        except HTTPException:
            await websocket.accept()
            await websocket.close(code=4001)
            return
        # Authorized: accept and echo a marker so the test can confirm the join.
        await websocket.accept()
        await websocket.send_text("connected")
        await websocket.close()

    return TestClient(app)


# ── 1. The real verifier extracts sub and rejects bad tokens ───────────────────

@pytest.mark.asyncio
async def test_real_verifier_extracts_sub(monkeypatch):
    auth = _reload_auth(monkeypatch)
    uid = await auth.verify_jwt_token(authorization="Bearer " + jwt.encode({"sub": "u1"}, SECRET, algorithm="HS256"))
    assert uid == "u1"


# ── 2. Behavioral BOLA gate ────────────────────────────────────────────────────

def test_owner_can_subscribe_to_own_stream(monkeypatch):
    auth = _reload_auth(monkeypatch)
    client = _ws_app(auth)
    token = jwt.encode({"sub": "userA"}, SECRET, algorithm="HS256")
    with client.websocket_connect(f"/ws/notifications/userA?token={token}") as ws:
        assert ws.receive_text() == "connected"


def test_cross_tenant_subscribe_is_refused_4003(monkeypatch):
    """[HELD] Valid token for A, subscribing to B's stream → closed 4003, never joined."""
    auth = _reload_auth(monkeypatch)
    client = _ws_app(auth)
    token_a = jwt.encode({"sub": "userA"}, SECRET, algorithm="HS256")
    with pytest.raises(WebSocketDisconnect) as exc:
        with client.websocket_connect(f"/ws/notifications/userB?token={token_a}") as ws:
            ws.receive_text()
    assert exc.value.code == 4003


def test_missing_token_is_refused_4001(monkeypatch):
    auth = _reload_auth(monkeypatch)
    client = _ws_app(auth)
    with pytest.raises(WebSocketDisconnect) as exc:
        with client.websocket_connect("/ws/notifications/userA") as ws:
            ws.receive_text()
    assert exc.value.code == 4001


def test_invalid_token_is_refused_4001(monkeypatch):
    auth = _reload_auth(monkeypatch)
    client = _ws_app(auth)
    # signed with the wrong secret → verifier raises → 4001
    bad = jwt.encode({"sub": "userA"}, "attacker", algorithm="HS256")
    with pytest.raises(WebSocketDisconnect) as exc:
        with client.websocket_connect(f"/ws/notifications/userA?token={bad}") as ws:
            ws.receive_text()
    assert exc.value.code == 4001


# ── 3. Source-integrity: the deployed handler still enforces the gate ──────────

def test_main_py_handler_still_enforces_sub_equals_path():
    """Drift guard: the real WS handler in main.py must still compare sub to the path
    and close on mismatch / missing token. If this gate is ever removed, this fails."""
    main_src = Path(__file__).resolve().parents[3] / "core" / "src" / "main.py"
    text = main_src.read_text(encoding="utf-8")
    assert 'websocket("/ws/notifications/{user_id}")' in text
    assert "verified_user_id != user_id" in text
    assert "code=4003" in text
    assert "code=4001" in text
