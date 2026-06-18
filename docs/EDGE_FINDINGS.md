# EDGE_FINDINGS.md — VeldrixAI Phase 3.5 PR 2 Extended Edge-Case Battery

> **Report-only.** PR 2 adds tests + this report; it changes **zero production code**
> (the only production fixes were the five findings remediated in PR 1). Any NEW issue
> found here is **documented, not fixed** — it is triage input for a later, named phase.
> The "PROBE" tests assert the *actual current behavior* so the suite stays green and
> every finding is reproducible from a passing test.
>
> **Scope:** the engine + substrate + service perimeter, pushed harder on the 2026
> threat surface, plus the three Phase-3 "Not reached" gaps. Out of scope (unchanged):
> pillar/detection accuracy, `route_inference()`, prompts, model slugs, signal
> production; the engine is still **not wired** into any request path.

---

## 1. Executive summary

The extended battery added **225 cases** (224 pass, 1 environment-skip) across new
isolated trees: `tests/adversarial/` (chain-fork concurrency, JWT, WebSocket BOLA) and
`tests/edge/` (numeric pathology, Unicode/encoding, resolution torture, mode edges, an
exhaustive fail-closed matrix, canonical completeness, audit reproducibility).

**Headline: the three Phase-3 "Not reached" gaps are all HELD — no hidden High.**

1. **Concurrent chain-fork race — HELD.** Under true parallelism (16 threads, own
   connections, released by a barrier) the per-tenant `pg_advisory_xact_lock`
   serializes writers: every record gets a unique, contiguous `chain_seq`, a unique
   `prev_hash`, a single unbroken linkage, and `verify_chain` passes. No fork. (This was
   the candidate hidden High; it is closed.)
2. **JWT verification — HELD.** `alg:none`, algorithm confusion, expired/`nbf`-future,
   tampered/malformed, wrong-secret are all rejected; the accepted algorithm is pinned
   server-side and cannot be widened by the token header; missing `sub` → 401.
3. **WebSocket BOLA — HELD.** `/ws/notifications/{user_id}` enforces token `sub` ==
   path `user_id` (close 4003 on mismatch, 4001 on missing/invalid token); a
   source-integrity check guards against the gate being silently removed.

The deeper engine sweeps (numeric, Unicode, resolution, mode, fail-closed, canonical,
reproducibility) all held the core guarantees, including an **exhaustive 100-cell
fail-closed matrix** (5 pillars × 10 degradation forms × 2 fail-modes) in which **no
cell produced a silent allow** and every degradation was recorded.

**New issues (all Low / Informational; report-only):**

| # | Issue | Severity | Class |
|---|-------|----------|-------|
| EF-AUTH-EMPTYSUB-1 | Empty-but-present JWT `sub` authenticates as principal `""` | **Low** | Broken auth (robustness) |
| EF-AUTH-UNSETSECRET-1 | Unset `JWT_SECRET_KEY` → uncaught `JWKError` (500) instead of clean 401 | **Info** | Ungraceful fail-closed |
| EF-TYPE-COERCE-1 | `SignalContext` does not enforce declared numeric types | **Low** | Input validation |
| EF-UNICODE-NFC-1 | No Unicode normalization → NFC/NFD operand-vs-value mismatch | **Low** | Evasion (bounded) |
| EF-CANON-KEYS-1 | Residual canonical collision: non-string dict keys coerced to strings | **Low (latent)** | Tamper-evidence (latent) |

**Counts:** 0 Critical · 0 High · 0 Medium · 3 Low · 2 Informational.

None of the new issues is a fail-open of an enforcement decision, and each requires
either a signed token (auth), an upstream type/normalization defect, or a non-JSON
ingress that does not exist today.

---

## 2. New findings (report-only)

### EF-AUTH-EMPTYSUB-1 — Empty-but-present `sub` authenticates as the empty principal
- **Framework:** OWASP **API2:2023 Broken Authentication**.
- **Severity: Low.** A validly-signed token is required (an attacker cannot forge the
  signature without the secret), so this is a robustness gap, not a remote bypass.
- **Where:** `backend/connectors/src/core/middleware/auth.py:31-33` —
  `user_id = payload.get("sub"); if user_id is None: raise 401`. An empty string is not
  `None`, so `sub: ""` passes and `get_current_user` returns `{"id": ""}`.
- **Reproduction:** `tests/adversarial/test_jwt_auth.py::test_empty_string_sub_behaviour`
  (asserts the current accept-as-`""` behavior).
- **Impact:** any data path scoped by `user_id == ""` would be addressable by such a
  token; mostly relevant if the system ever mints tokens with an empty subject.
- **Remediation direction:** reject falsy `sub` (`if not user_id: raise 401`), not just
  `None`.

### EF-AUTH-UNSETSECRET-1 — Unset `JWT_SECRET_KEY` raises `JWKError` instead of 401
- **Framework:** NIST AI RMF MANAGE (graceful degradation); OWASP API2 (adjacent).
- **Severity: Informational.** Still **fail-closed** — no token is accepted; the request
  is denied. The defect is that it denies via an uncaught `JWKError` (→ 500) rather than
  the clean 401 the docstring implies, because `verify_token` catches only `JWTError`
  and `JWKError` is not a subclass.
- **Where:** `auth.py:14-19` (`verify_token`).
- **Reproduction:** `tests/adversarial/test_jwt_auth.py::test_unset_secret_fails_closed`.
- **Impact:** noisier failure / 500s on a misconfigured deployment; no security bypass.
- **Remediation direction:** treat an unset secret as an explicit closed state (return
  `None` / 401 up front), or widen the `except` to `(JWTError, JWKError)`.

### EF-TYPE-COERCE-1 — Declared numeric signal types are not enforced at the boundary
- **Framework:** OWASP **LLM06** (adjacent); NIST AI RMF MEASURE (signal validity).
- **Severity: Low.** Requires an upstream production defect (pillars emit floats today);
  the *unsafe* direction is bounded.
- **Where:** `backend/core/src/policy/context.py` — `SIGNAL_FIELDS` types are
  "documentation + light validation"; `SignalContext.__post_init__` does not coerce or
  reject a wrongly-typed value (only non-finite floats are normalized, per PR-1).
- **Behavior (characterized):** a string-typed score makes **ordering** comparisons
  (`<`,`>`) raise `TypeError` → `ConditionRuntimeError` → `fail_mode` (so high/critical
  fail **closed** — safe), but **equality** comparisons (`==`,`!=`) do not raise — they
  silently evaluate (`"40" == 40` → False), so an `== N` rule simply does not fire.
- **Reproduction:** `tests/edge/test_numeric_pathology.py::`
  `{test_string_score_ordering_fails_closed, test_string_score_equality_silently_mismatches_PROBE}`.
- **Impact:** a malformed (non-numeric) signal can cause an equality-phrased rule to
  silently not match. Not a fail-open of a threshold floor (those raise → fail_mode).
- **Remediation direction:** enforce declared types at `SignalContext` construction
  (coerce or treat a type-mismatched score as missing → `evaluated:false`).

### EF-UNICODE-NFC-1 — No Unicode normalization on string operands/values
- **Framework:** OWASP **LLM01-adjacent** (evasion); NIST AI RMF MEASURE.
- **Severity: Low.** Reachability depends on the matched field being attacker-influenced;
  `region`/`action_class` production is out of scope (signal layer).
- **Where:** evaluator string comparisons are exact; no `unicodedata.normalize`.
- **Behavior:** a condition operand authored in NFC (`"café"`, U+00E9) does **not** match
  a signal value in NFD (`"café"`, `e`+U+0301). A normalization-form mismatch can evade a
  string-equality rule.
- **Reproduction:** `tests/edge/test_unicode_encoding.py::test_nfc_nfd_operand_value_mismatch_PROBE`.
  (Homoglyph/zero-width/RTL field **names** are correctly rejected; string **operands**
  match exactly — both HELD.)
- **Remediation direction:** if string-valued signals can carry user-influenced data,
  normalize (NFC) both operands and values before comparison, and consider casefolding
  for case-insensitive matches.

### EF-CANON-KEYS-1 — Residual canonical collision on non-string dict keys
- **Framework:** NIST AI RMF **MANAGE** (tamper-evidence integrity).
- **Severity: Low (latent).** Not reachable via the JSON-over-HTTP audit ingress (keys
  arrive as strings); survives the F-CANON-1 fix because it is inherent to `json.dumps`
  **key coercion**, not the removed `default=str`.
- **Where:** `backend/connectors/src/modules/analytics/audit_hash.py::canonical_json`
  (and core's identical recipe).
- **Behavior:** `{1: "a"}` and `{"1": "a"}` (and `{1.5: "a"}` vs `{"1.5": "a"}`) share a
  canonical form / `record_hash`. `True`-key vs `1`-key do **not** collide
  (`"true"` ≠ `"1"`).
- **Reproduction:** `tests/edge/test_canonical_completeness.py::`
  `{test_int_key_collides_with_string_key_PROBE, test_float_key_collides_with_string_key_PROBE}`.
- **Impact:** for any future internal caller that hashes a dict with non-string keys,
  two distinct objects could share a hash. Latent; JSON-native distinctness across the
  full value space otherwise holds, and non-JSON inputs now raise in parity with core.
- **Remediation direction:** reject non-string keys in the canonical encoder (or a typed,
  key-preserving canonical form shared by both services).

---

## 3. Coverage matrix (extended battery × result)

| Domain | Probe | Tested? | Result | Evidence |
|--------|-------|:------:|--------|----------|
| 3.4 | Concurrent chain-fork under true parallelism (advisory lock) | ✅ (ephemeral PG) | **HELD** | test_chain_fork_concurrency |
| 3.4 | Cross-tenant chain independence under concurrency | ✅ (ephemeral PG) | **HELD** | test_chain_fork_concurrency |
| 3.5 | JWT `alg:none` | ✅ | **HELD** (refused/unencodable) | test_jwt_auth |
| 3.5 | JWT algorithm confusion / header-alg widening | ✅ | **HELD** (pinned server-side) | test_jwt_auth |
| 3.5 | JWT expired / `nbf` future / tampered / malformed / wrong secret | ✅ | **HELD** | test_jwt_auth |
| 3.5 | JWT missing `sub` | ✅ | **HELD** (401) | test_jwt_auth |
| 3.5 | JWT empty `sub` | ✅ | **DEFEATED** (EF-AUTH-EMPTYSUB-1) | test_jwt_auth |
| 3.5 | JWT unset secret fail-closed | ✅ | **HELD** (closed; ungraceful — EF-AUTH-UNSETSECRET-1) | test_jwt_auth |
| 3.5 | WebSocket `sub == path` BOLA | ✅ | **HELD** (4003/4001) | test_ws_bola |
| 3.5 | WS handler source-integrity (gate not silently dropped) | ✅ | **HELD** | test_ws_bola |
| 3.3 | Signed zero / subnormal / exact boundary / overflow→inf | ✅ | **HELD** | test_numeric_pathology |
| 3.3 | int/float coercion | ✅ | **HELD** | test_numeric_pathology |
| 3.3 | String-numeric: ordering fail-closed / equality silent | ✅ | **HELD / PROBE** (EF-TYPE-COERCE-1) | test_numeric_pathology |
| 3.1 | Unicode field names (homoglyph/zero-width/RTL/fullwidth) | ✅ | **HELD** (rejected) | test_unicode_encoding |
| 3.1 | String operands: zero-width/RTL/astral exact-match | ✅ | **HELD** | test_unicode_encoding |
| 3.1 | NFC/NFD operand-vs-value | ✅ | **PROBE** (EF-UNICODE-NFC-1) | test_unicode_encoding |
| 3.1 | Overlong field name / source (length bound) | ✅ | **HELD** | test_unicode_encoding |
| 3.2 | Thousands of matching rules → deterministic winner | ✅ | **HELD** | test_resolution_torture |
| 3.2 | Total tie on every level → document order | ✅ | **HELD** | test_resolution_torture |
| 3.2 | Fallback-only (errored→fail-closed) rule competes | ✅ | **HELD** | test_resolution_torture |
| 3.2 | Reload idempotency / order-independent winner | ✅ | **HELD** | test_resolution_torture |
| 3.2 | default_action most/least restrictive on no-match | ✅ | **HELD** | test_resolution_torture |
| 2.8 | Mode `_coerce` malformed/null/case/type → shadow | ✅ | **HELD** | test_mode_resolution_edges |
| 2.8 | `enforce_critical_only` critical/high boundary | ✅ | **HELD** | test_mode_resolution_edges |
| 2.8 | Cache TTL staleness (safe direction) / invalidate | ✅ | **HELD** | test_mode_resolution_edges |
| 2.8 | Lookup failure / 401-gated endpoint → shadow | ✅ | **HELD** | test_mode_resolution_edges |
| 3.3 | Fail-closed matrix: 5 pillars × 10 forms × 2 fail-modes | ✅ | **HELD** (100/100, none silent allow) | test_fail_closed_matrix |
| 3.4 | Canonical: JSON-native distinctness (full type space) | ✅ | **HELD** | test_canonical_completeness |
| 3.4 | Canonical: non-JSON inputs raise (parity with core) | ✅ | **HELD** | test_canonical_completeness |
| 3.4 | Canonical: non-string key coercion | ✅ | **PROBE** (EF-CANON-KEYS-1) | test_canonical_completeness |
| 3.2 | Decision reproducibility under adversarial payloads | ✅ | **HELD** | test_audit_reproducibility |
| 3.2 | Snapshot JSON round-trip / offline reproduction | ✅ | **HELD** | test_audit_reproducibility |

---

## 4. Still not reached (honest)

- **Live multi-process mode-change ↔ in-flight evaluation race.** We tested the
  `mode_client` cache/TTL semantics, the `_coerce` fail-safe, and `_compute_enforced`
  gating math, but not a true cross-process race of a mode flip landing during an
  in-flight decision. By construction the decision reads the mode once and every
  degenerate read resolves to `shadow`/over-gate (safe), so the unsafe direction is not
  expected — but it was not exercised under real concurrency.
- **Algorithm-confusion with a real RSA keypair** where the PEM public key is used as
  the HMAC secret. The deployment is HMAC-only (HS256); we asserted RS-headed tokens are
  rejected and the algorithm is pinned, but did not stand up an RSA keypair to attempt
  the classic RS→HS confusion end-to-end.
- **Precedence stability across a true mid-resolution policy reload** in a live
  multi-threaded engine. The engine caches immutable policies by `(policy_id, version)`
  and resolution is synchronous over a snapshot, so a "swap mid-resolution" is not
  reachable by construction; we tested reload idempotency instead.
- **`/metrics` + disclosure endpoints under a real concurrent scrape/load.** Covered by
  PR-1 functional tests and code, not a load harness.

---

## 5. Methodology

- **What ran:** 225 new cases (224 pass, 1 environment-skip for a `jose` build that
  refuses to encode `alg:none` — itself a closed posture). Trees:
  - `backend/connectors/tests/adversarial/` — `test_chain_fork_concurrency.py` (2,
    ephemeral PG), `test_jwt_auth.py` (17).
  - `backend/core/tests/adversarial/` — `test_ws_bola.py` (6).
  - `backend/core/tests/edge/` — numeric (12), unicode (15), resolution (9), mode (20),
    fail-closed matrix (101), reproducibility (21).
  - `backend/connectors/tests/edge/` — canonical completeness (22).
- **Test database:** the concurrent chain-fork harness ran against an **ephemeral,
  disposable `postgres:16-alpine`** (created + destroyed for the run); it **skips** if no
  ephemeral DB is provided and is never pointed at a shared/production DB. All other
  cases are pure-Python.
- **Report-only discipline:** zero production-code changes in PR 2 (verified by
  `git diff` — tests + this report only). Every new issue is documented here and left
  for triage; "PROBE" tests assert current behavior so the suite is green and findings
  reproduce.
- **Framework caveat (unchanged from Phase 3):** control IDs are anchored to OWASP LLM
  Top 10 (2025), OWASP API Security Top 10 (2023), MITRE ATLAS, NIST AI RMF 1.0; these
  revisions could not be confirmed against a live source from this offline environment —
  verify each cited ID before external publication. No control ID, CVSS, or reproduction
  was fabricated; every reproduction was executed (or is listed under "Still not reached").

_End of report. Findings are triage input for a later, named phase; PR 2 fixes nothing._
