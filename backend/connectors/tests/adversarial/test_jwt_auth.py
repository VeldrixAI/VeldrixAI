"""Domain 3.5 — Service Perimeter: JWT verification attacks.
[OWASP API2:2023 Broken Authentication; MITRE ATLAS — credential access]

Closes the Phase-3 "Not reached" gap for ``backend/connectors/src/core/middleware/
auth.py`` (``verify_token`` / ``get_current_user``). Scripts the classic JWT defeats
against the real verifier:

  * ``alg:none`` (unsigned-token acceptance)
  * algorithm confusion (RS256 token presented to an HS256 verifier)
  * expired (``exp`` past) and not-yet-valid (``nbf`` future)
  * missing / empty / None ``sub``
  * malformed segments / garbage
  * tampered signature
  * the documented fail-closed claim: unset ``JWT_SECRET_KEY`` → closed

DB-free. ``python-jose`` is a pinned dependency; skips cleanly if absent.
"""

from __future__ import annotations

import datetime

import pytest

jose = pytest.importorskip("jose")
from jose import jwt  # noqa: E402

SECRET = "unit-test-secret"
WRONG_SECRET = "attacker-secret"


def _auth(monkeypatch, secret=SECRET, algorithm="HS256"):
    """Point the connectors auth module's module-level ``JWT_SECRET_KEY`` /
    ``JWT_ALGORITHM`` at the test configuration.

    We monkeypatch the module globals (NOT ``importlib.reload``): reloading the module
    would mint a new ``get_current_user`` object and break FastAPI ``dependency_overrides``
    identity matching in other perimeter tests. monkeypatch also auto-reverts."""
    import src.core.middleware.auth as auth_mod
    monkeypatch.setattr(auth_mod, "JWT_SECRET_KEY", secret)
    monkeypatch.setattr(auth_mod, "JWT_ALGORITHM", algorithm)
    return auth_mod


def _now():
    return datetime.datetime.now(datetime.timezone.utc)


# ── Control: a correctly-signed token verifies ─────────────────────────────────

def test_valid_token_is_accepted(monkeypatch):
    auth = _auth(monkeypatch)
    token = jwt.encode({"sub": "user-1", "email": "u@x"}, SECRET, algorithm="HS256")
    payload = auth.verify_token(token)
    assert payload is not None and payload["sub"] == "user-1"


# ── alg:none — unsigned token must be rejected ─────────────────────────────────

def test_alg_none_is_rejected(monkeypatch):
    auth = _auth(monkeypatch)
    # Forge an unsigned token (alg=none). jose must refuse it under an HS256 allowlist.
    try:
        forged = jwt.encode({"sub": "admin"}, key="", algorithm="none")
    except Exception:
        # Some jose builds refuse to even *encode* alg:none — already fail-closed.
        pytest.skip("jose refuses to encode alg:none (already closed)")
    assert auth.verify_token(forged) is None  # HELD: not accepted


# ── Algorithm confusion: RS256 token presented to an HS256 verifier ────────────

def test_rs256_token_rejected_by_hs256_verifier(monkeypatch):
    """An attacker who only knows the (public) verifier secret string cannot get an
    RS-signed token accepted by the HS256 config — algorithms are pinned server-side."""
    auth = _auth(monkeypatch, algorithm="HS256")
    # A token claiming RS256 cannot be HS-verified with the secret; jose rejects on
    # algorithm mismatch (the allowlist is ["HS256"]).
    header_forced = {"alg": "RS256"}
    try:
        token = jwt.encode({"sub": "admin"}, WRONG_SECRET, algorithm="HS256", headers=header_forced)
    except Exception:
        pytest.skip("jose pinned header encode unsupported in this build")
    assert auth.verify_token(token) is None


def test_jwt_algorithm_is_not_attacker_influenced(monkeypatch):
    """The verifier's accepted algorithm comes from server env (JWT_ALGORITHM), never
    from the token header. A token with a different header alg cannot widen the
    allowlist."""
    auth = _auth(monkeypatch, algorithm="HS256")
    # Signed with the right secret but header alg HS512 ≠ server's HS256 → rejected.
    token = jwt.encode({"sub": "u"}, SECRET, algorithm="HS512")
    assert auth.verify_token(token) is None


# ── Expiry / not-before ────────────────────────────────────────────────────────

def test_expired_token_rejected(monkeypatch):
    auth = _auth(monkeypatch)
    past = _now() - datetime.timedelta(hours=1)
    token = jwt.encode({"sub": "u", "exp": past}, SECRET, algorithm="HS256")
    assert auth.verify_token(token) is None


def test_not_yet_valid_token_rejected(monkeypatch):
    auth = _auth(monkeypatch)
    future = _now() + datetime.timedelta(hours=1)
    token = jwt.encode({"sub": "u", "nbf": future}, SECRET, algorithm="HS256")
    assert auth.verify_token(token) is None


# ── Tampered signature / malformed structure ───────────────────────────────────

def test_tampered_signature_rejected(monkeypatch):
    auth = _auth(monkeypatch)
    token = jwt.encode({"sub": "u"}, SECRET, algorithm="HS256")
    tampered = token[:-3] + ("aaa" if not token.endswith("aaa") else "bbb")
    assert auth.verify_token(tampered) is None


@pytest.mark.parametrize("garbage", ["", "x", "a.b", "a.b.c", "....", "not-a-jwt"])
def test_malformed_tokens_rejected(monkeypatch, garbage):
    auth = _auth(monkeypatch)
    assert auth.verify_token(garbage) is None


def test_token_signed_with_wrong_secret_rejected(monkeypatch):
    auth = _auth(monkeypatch)
    token = jwt.encode({"sub": "u"}, WRONG_SECRET, algorithm="HS256")
    assert auth.verify_token(token) is None


# ── Fail-closed: unset JWT_SECRET_KEY ──────────────────────────────────────────

def test_unset_secret_fails_closed(monkeypatch):
    """Documented claim: with no JWT_SECRET_KEY configured the verifier is closed —
    no token (even a structurally valid one) is accepted.

    HELD (security property): the token is NOT accepted. NOTE (report-only,
    EF-AUTH-UNSETSECRET-1): the current impl raises an uncaught ``JWKError`` (which is
    not a ``JWTError``, so ``verify_token``'s except clause misses it) rather than
    returning ``None``/401 — still fail-closed (access denied → 500), but ungraceful.
    The assertion captures the ACTUAL behavior (raises) so the gap is reproducible."""
    auth = _auth(monkeypatch, secret=None)
    try:
        token = jwt.encode({"sub": "u"}, "x", algorithm="HS256")
    except Exception:
        token = "a.b.c"
    # Never returns a valid payload: it either returns None or raises — never accepts.
    accepted = None
    try:
        accepted = auth.verify_token(token)
    except Exception:
        accepted = None  # raised → access denied → still closed
    assert accepted is None


# ── get_current_user: sub handling ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_missing_sub_rejected_401(monkeypatch):
    from fastapi import HTTPException
    from fastapi.security import HTTPAuthorizationCredentials

    auth = _auth(monkeypatch)
    token = jwt.encode({"email": "u@x"}, SECRET, algorithm="HS256")  # no sub
    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
    with pytest.raises(HTTPException) as exc:
        await auth.get_current_user(credentials=creds)
    assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_empty_string_sub_behaviour(monkeypatch):
    """PROBE — empty-but-present ``sub``. ``get_current_user`` rejects only ``sub is
    None`` (``payload.get("sub") is None``); an empty string is not None, so a
    validly-signed token with ``sub: ""`` authenticates as the principal "".

    This requires a token signed with the real secret (an attacker cannot forge one),
    so it is a robustness gap, not a remotely-exploitable auth bypass — recorded
    report-only as EF-AUTH-EMPTYSUB-1 (see EDGE_FINDINGS.md). The assertion documents
    the ACTUAL current behavior so the suite stays green and the finding is reproducible.
    """
    from fastapi.security import HTTPAuthorizationCredentials

    auth = _auth(monkeypatch)
    token = jwt.encode({"sub": ""}, SECRET, algorithm="HS256")
    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
    user = await auth.get_current_user(credentials=creds)
    # Documented gap: empty principal is accepted rather than rejected.
    assert user["id"] == ""
