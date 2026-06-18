# SECURITY_FINDINGS.md — VeldrixAI Phase 3 Adversarial QA

> **Find-and-report only.** No production code was modified and no finding was fixed.
> The single change to the repository is the addition of `RECON-QA.md`, this file, and
> the new isolated `tests/adversarial/` trees. Remediation is a separate, later phase.

> **⟶ REMEDIATION STATUS (Phase 3.5 — PR 1, this branch).** All five findings + the
> two appendix items below are now **FIXED**. Each finding's adversarial test was
> flipped **DEFEAT → HELD** (same attack, asserts the fix because the behavior
> changed — no test was weakened). The forensic narrative below is preserved as the
> historical record that authorized the fix.
>
> | Finding | Status | Proof (flipped test) |
> |---|---|---|
> | F-BOLA-1 | ✅ Fixed | `test_perimeter_http::test_bola_detail_returns_other_tenants_record_uuid_request_id` (now 404, no other-tenant data) |
> | F-UNAUTH-1 | ✅ Fixed | `test_perimeter_http::{test_internal_audit_write_requires_no_auth, test_internal_audit_write_accepts_valid_token, test_internal_disclosure_routes_reject_unauthenticated, test_metrics_exposition_carries_no_per_tenant_uuid}` |
> | F-FAILOPEN-NAN-1 | ✅ Fixed | `test_fail_open_engine::{test_nan_score_evades_threshold_rule_DEFEAT_partial, test_inf_score_behaviour_is_recorded}` (now fail-closed) |
> | F-CANON-1 | ✅ Fixed | `test_audit_canonical_collision::{test_default_str_enables_latent_collision_DEFEAT, test_byte_for_byte_parity_with_core_is_FALSE_for_non_json_inputs_DEFEAT}` (now raise; parity restored) |
> | F-EVAL-DOS-1 | ✅ Fixed | `test_evaluator_sandbox::test_deeply_nested_unaryop_DEFEAT_uncontrolled_resource_exhaustion` (now controlled `ConditionCompileError`) |
> | Appendix #1/#2 | ✅ Fixed | docstring `false`→`False`; `/health/ready` no longer echoes `str(exc)` |
>
> Scope of the fix was minimal and finding-scoped; the engine remains **not wired**
> into any request path (unchanged).
>
> **Scope:** engine + substrate + service perimeter of Phases 1–2 (RECON-QA.md). This
> assessment asks "can the system be tricked, broken, bypassed, or made to fail-open?"
> — **not** "are the pillar scores correct?" (detection accuracy is Phase 4).

---

## 1. Executive summary (for the compliance reader)

An independent red-team pass executed **103 adversarial test cases** against the
deterministic Policy Engine, its production runtime host, the tamper-evident audit
substrate, and the new Phase-2 service perimeter. The four "crown-jewel" governance
guarantees were each explicitly attacked.

**Posture: strong at the core, with real gaps at the live service perimeter.**

The Policy Engine's security model held up well: the condition-language sandbox
resisted every code-execution / escape attempt, decisions were deterministic under
concurrency, and **no degradation path produced a silent `allow`** with one
conditional exception (non-finite scores, below). The audit hash chain is genuinely
tamper-evident — including at the **database layer**, where the append-only trigger
blocked every direct `UPDATE`/`DELETE` we threw at it on a real Postgres instance.
The default-safe `shadow` invariant proved unbreakable, and the enforcement-mode
token fails safe (disabled, not open) when unconfigured.

The weaknesses are on the **connectors service perimeter, which — unlike the Policy
Engine — is actually deployed and serving traffic today**:

| # | Finding | Severity | Crown-jewel impact |
|---|---------|----------|--------------------|
| F-BOLA-1 | Cross-tenant audit-record disclosure via the audit-detail "unscoped fallback" | **High** | PII / governed-content leak across tenants |
| F-UNAUTH-1 | Unauthenticated internal endpoints (audit-write, preflight, chain-health, mode-read, `/metrics`) | **High** | Forged-audit injection / chain poisoning; cross-tenant disclosure |
| F-FAILOPEN-NAN-1 | Non-finite (NaN/Inf) signal scores evade `score < X` rules | **Medium** | Conditional silent fail-open |
| F-CANON-1 | Canonical serializer `default=str` → latent collision + false "parity with core" claim | **Low** | Latent tamper-evidence weakness (not reachable via JSON ingress today) |
| F-EVAL-DOS-1 | Unbounded condition nesting crashes policy load (RecursionError/MemoryError) | **Low** | Load-time DoS (authored input; engine not actuated) |

**Counts:** 0 Critical · 2 High · 1 Medium · 2 Low/Informational.

**Crown-jewel verdict:**
1. **No silent fail-open** — *HELD*, except the conditional **F-FAILOPEN-NAN-1** (Medium).
2. **Audit chain tamper-evident** — *HELD* (logic + DB-level trigger verified on
   ephemeral Postgres). Caveat: the byte-for-byte "parity with core" claim is false for
   non-JSON inputs (**F-CANON-1**, latent).
3. **Default-safe `shadow` invariant** — *HELD* (unbreakable across every attacked path).
4. **No PII leak via metrics/errors** — core `/metrics` *HELD*; connectors perimeter
   *PARTIAL* — per-tenant identifiers + volume are exposed unauthenticated (**F-UNAUTH-1**).

A recurring theme: the most serious issues (F-BOLA-1, F-UNAUTH-1) are on **live,
actuated** surfaces, whereas the engine findings are bounded by the fact that **the
Policy Engine is not yet wired into any request path** (RECON-QA §0) — its guarantees
are tested in isolation and are not currently production-exploitable.

---

## 2. Findings

Each finding: ID/title · framework mapping · severity (reasoned) · guarantee under
test · result · reproduction (runnable) · impact · remediation direction (pointer only).

---

### F-BOLA-1 — Cross-tenant audit-record disclosure via the audit-detail "unscoped fallback"

- **Framework:** OWASP **API1:2023 Broken Object Level Authorization (BOLA)**; also NIST AI RMF MANAGE (governance-evidence confidentiality).
- **Severity: High.** *Reasoning (CVSS-style, reasoned not fabricated):* network-accessible, authenticated-but-any-tenant attacker; confidentiality impact High (full audit record incl. governed `prompt_preview`/`response_preview`, verdict, pillar scores of another tenant); integrity/availability none. Attack complexity is moderated by the need to know a **UUID-shaped** `request_id` (unguessable at random) — but such IDs routinely leak via support tickets, logs, referers, or shared links, making targeted disclosure low-effort. This is a **live, deployed** endpoint.
- **Guarantee under test:** the audit API is tenant-scoped — a caller may read only their own records.
- **Result: DEFEATED (conditional on UUID-shaped request_id).**
- **Reproduction:** `backend/connectors/tests/adversarial/test_perimeter_http.py::test_bola_detail_returns_other_tenants_record_uuid_request_id` (ephemeral Postgres). Tenant B owns a record with a UUID `request_id`; tenant A authenticates and `GET /api/audit-trails/{that-uuid}/detail` → **HTTP 200 with B's record and its `metadata.secret`**. The code path is the "unscoped fallback" at `backend/connectors/src/modules/analytics/audit_controller.py:478-501` (`return _serialize(any_r)`), which drops the `user_id` scope filter. The companion test `::test_bola_non_uuid_request_id_is_accidentally_404` documents the precise reachability boundary: a *non*-UUID `request_id` makes the intervening primary-key lookup (`AuditTrail.id == request_id`) raise `InvalidTextRepresentation`, aborting the transaction so the fallback can't run — an accidental, fragile mitigation, not a designed control.
- **Impact:** an attacker gains another tenant's governed audit content — a direct cross-tenant **PII / sensitive-information disclosure** (crown-jewel #4 breach on the live API).
- **Remediation direction:** remove the unscoped fallback (lines 478-501) entirely, or re-apply the `user_id` scope to it and return 404 on mismatch; the "debug" cross-user return should never reach production.

---

### F-UNAUTH-1 — Unauthenticated internal endpoints (audit-write, preflight, chain-health, mode-read, `/metrics`)

- **Framework:** OWASP **API2:2023 Broken Authentication**, **API3:2023 Broken Object Property Level Authorization** (excessive data exposure), **API5:2023 Broken Function Level Authorization**, **API10:2023 Unsafe Consumption / unbounded resource use**. MITRE ATLAS — exfiltration / discovery against the governance layer.
- **Severity: High** (driven by the audit-write endpoint); **Medium** for the read-only disclosure endpoints. *Reasoning:* `POST /api/audit-trails/internal/audit-trail` has **no auth gate** and appends rows into the per-tenant hash chain — an attacker who can reach it can inject forged/poisoning audit records for any `user_id` (integrity impact High on the evidence trail). The disclosure endpoints (`GET /preflight-report`, `GET /chain-health`, `GET /enforcement-mode`, and the per-tenant labels in `GET /metrics`) leak cross-tenant existence, decision volume, blast-radius and chain length (confidentiality Medium). All are gated only by presumed network isolation, which no code enforces.
- **Guarantee under test:** internal/service endpoints are not reachable by untrusted callers; metrics carry no tenant identifiers.
- **Result: DEFEATED (partial — depends on network exposure).**
- **Reproduction:**
  - Audit-write without credentials → 201 + `inserted:true`: `backend/connectors/tests/adversarial/test_perimeter_http.py::test_internal_audit_write_requires_no_auth` (ephemeral Postgres). Code: `audit_controller.py:281-328` (only `Depends(get_db)`, no auth).
  - Disclosure endpoints have no auth dependency (code inspection, RECON-QA §5a): `policy_controller.py:57-68` (read mode), `:107-115` (preflight blast-radius), `chain_health_controller.py:20-29`, and the per-tenant UUID labels in `chain_metrics.py:59-78` rendered by `main.py:173-184` (`GET /metrics`). These were mapped but the HTTP disclosure was not separately scripted (see Coverage matrix — honestly noted).
- **Impact:** forged audit injection / chain-history pollution (undermines the entire tamper-evident substrate's *completeness*, even though existing rows stay individually tamper-evident); cross-tenant operational intelligence (who is enforcing, at what volume) to an unauthenticated scraper; unbounded `chain-health/refresh` verification work (DoS amplification).
- **Remediation direction:** require `INTERNAL_SERVICE_TOKEN` (the same fail-safe dependency already used by the mode-mutation routes, `policy_controller.py:26-39`) on **all** `internal/*` routes including the audit-write; drop per-tenant UUID labels from `/metrics` (aggregate or hash them) or place `/metrics` behind network policy + auth; rate-limit `chain-health`.

---

### F-FAILOPEN-NAN-1 — Non-finite (NaN/Inf) signal scores evade threshold rules

- **Framework:** OWASP **LLM06:2025 Excessive Agency** (silent allow); NIST AI RMF MEASURE (signal validity).
- **Severity: Medium.** *Reasoning:* it is a genuine **fail-open** (the cardinal sin), but reachability is bounded: it requires an upstream pillar to emit a non-finite score (an upstream defect, not attacker-controlled in this layer), a policy authored in the natural `score < X` form, and a permissive `default_action`; and the engine is **not yet actuated**. A defensively phrased rule (`not (score >= X)`) catches it.
- **Guarantee under test:** "A skipped/invalid evaluation is never a pass"; no degradation path yields a silent allow (engine.py / context.py §2.4).
- **Result: DEFEATED (partial / conditional).**
- **Reproduction:** `backend/core/tests/adversarial/test_fail_open_engine.py::test_nan_score_evades_threshold_rule_DEFEAT_partial`. With `bias_score = NaN` and a **critical** rule `bias_score < 40` (default `allow`), the decision is `allow`/`enforced=false` — `NaN < 40` is `False`, so the catch-low rule silently does not fire. The same test shows the defensive phrasing `not (bias_score >= 40)` **does** block, documenting the mitigation. `::test_inf_score_behaviour_is_recorded` characterizes ±Inf. The gap is that neither `SignalContext` (`context.py:166-197`) nor the evaluator rejects non-finite numeric signals.
- **Impact:** a malformed/poisoned numeric signal can slip past a detection rule that an author reasonably believed was a floor — a silent gap in coverage.
- **Remediation direction:** reject or normalize non-finite values at signal-context construction (treat NaN/Inf `*_score` as missing → `evaluated:false` → fail-closed), so the existing "skipped is never a pass" machinery covers them.

---

### F-CANON-1 — Canonical serializer `default=str` enables latent collision and breaks the claimed parity with core

- **Framework:** NIST AI RMF **MANAGE** (integrity / tamper-evidence); supports the §6-mandated canonical-collision attempt.
- **Severity: Low / Informational.** *Reasoning:* the audit ingress is JSON-over-HTTP, so values reaching the hash are JSON-native (str/num/bool/null/list/dict) and the collision is **not reachable today**; impact is latent. It is recorded because (a) it defeats tamper-evidence for any future internal caller that hashes a non-JSON Python object, and (b) it makes a **documented security claim false**.
- **Guarantee under test:** the connectors canonical serializer is "byte-for-byte parity with core," and two different payloads cannot share a canonical form (audit_hash.py:9-22, :44-46).
- **Result: DEFEATED (latent) for the parity claim; collision HELD against the reachable (JSON-native) inputs.**
- **Reproduction:** `backend/connectors/tests/adversarial/test_audit_canonical_collision.py`.
  - `::test_default_str_enables_latent_collision_DEFEAT` — `{"x": Decimal("1.0")}` and `{"x": "1.0"}` produce identical canonical form and identical `record_hash` (distinct payloads, same hash).
  - `::test_byte_for_byte_parity_with_core_is_FALSE_for_non_json_inputs_DEFEAT` — core's recipe (no `default=str`) **raises `TypeError`** on the same input that connectors silently stringifies.
  - `::test_int_key_collides_with_string_key_under_default_str` — `{1:"a"}` ≡ `{"1":"a"}`.
  - Held controls: `::test_numeric_and_bool_representations_do_not_collide` (int/float/bool/string reprs are distinct) and `::test_json_native_inputs_DO_have_parity_with_core`.
- **Impact:** for any non-JSON-native value placed into a hashed identity, tamper-evidence could be silently weakened and the two services would disagree on a record's hash.
- **Remediation direction:** drop `default=str` (match core exactly) so non-serializable inputs raise rather than collide, or pin an explicit, type-preserving canonical encoder shared by both services; add a parity test for non-JSON inputs.

---

### F-EVAL-DOS-1 — Unbounded condition nesting crashes policy load

- **Framework:** OWASP **LLM10:2025 Unbounded Consumption** (resource exhaustion / DoS).
- **Severity: Low.** *Reasoning:* triggered at **policy-load time** by an authored condition (a semi-trusted policy author), not by per-request attacker input, and the engine is not actuated. No data disclosure; availability impact limited to policy load. Still a robustness gap that contradicts the "all escape attempts rejected at load with a controlled error" posture.
- **Guarantee under test:** "All sandbox-escape attempts … rejected HERE, at load time" with a controlled `ConditionError` (evaluator.py:134-137).
- **Result: DEFEATED (resource-exhaustion class only; code-exec escape HELD).**
- **Reproduction:** `backend/core/tests/adversarial/test_evaluator_sandbox.py::test_deeply_nested_unaryop_DEFEAT_uncontrolled_resource_exhaustion`. A condition of `("not " * 5000) + "safety_evaluated"` escapes `compile_condition()` as an **uncontrolled `RecursionError`** (depth ≥ ~1000) or `MemoryError` (≥ ~20000); the function catches only `SyntaxError` (`evaluator.py:144-147`). Characterized in-environment: depth 200 compiles, 1000 → RecursionError, 20000 → MemoryError.
- **Impact:** a single malformed/oversized policy can crash `PolicyEngine.load_policy()` (and, via the boot hook pattern, potentially a worker) instead of being cleanly rejected.
- **Remediation direction:** bound condition source length and AST depth in `compile_condition()` and convert `RecursionError`/`MemoryError` during parse/validate into a `ConditionCompileError`.

---

## 3. Coverage matrix (§3 guarantees × tested? × result)

| Domain | Guarantee | Tested? | Result | Evidence (test file) |
|--------|-----------|:------:|--------|----------------------|
| 3.1 | No call/attr/subscript/eval/exec/builtin reachable | ✅ | **HELD** | test_evaluator_sandbox (escape constructs, fstring) |
| 3.1 | Unknown names rejected; homoglyph field/op rejected | ✅ | **HELD** | test_evaluator_sandbox (unknown names, homoglyphs) |
| 3.1 | Type-confusion → ConditionRuntimeError, no crash | ✅ | **HELD** | test_evaluator_sandbox (type confusion) |
| 3.1 | Deep nesting handled with a controlled error | ✅ | **DEFEATED** (F-EVAL-DOS-1) | test_evaluator_sandbox (DoS) |
| 3.2 | Byte-identical decision under concurrency | ✅ | **HELD** | test_determinism_resolution (concurrent 400×16) |
| 3.2 | Strict 4-level precedence + correct tie-break | ✅ | **HELD** | test_determinism_resolution (severity/order/priority/4-way) |
| 3.2 | Extreme/overflow priority can't invert severity | ✅ | **HELD** | test_determinism_resolution (±2^63) |
| 3.2 | Immutability, checksum determinism, version control | ✅ | **HELD** | test_determinism_resolution (immutable/checksum/cache) |
| 3.2 | Empty/duplicate/contradictory policy handled safely | ✅ | **HELD** | test_determinism_resolution (empty/dup/single-fail) |
| 3.3 | Engine internal exception → fail closed (BLOCK) | ✅ | **HELD** | test_fail_open_engine (engine error) |
| 3.3 | score=92 demographic fast-path can't read as pass | ✅ | **HELD** | test_fail_open_engine (fast-path, evaluated flag) |
| 3.3 | Missing/partial critical signal → fail closed | ✅ | **HELD** | test_fail_open_engine + test_fail_open_runtime (timeout/collector) |
| 3.3 | fail_open recorded errored, never silently false | ✅ | **HELD** | test_fail_open_engine (fail_open record) |
| 3.3 | NaN/Inf scores never silently pass | ✅ | **DEFEATED** (F-FAILOPEN-NAN-1) | test_fail_open_engine (NaN/Inf) |
| 3.3 | Breaker-read failure / sink failure don't open | ✅ | **HELD** | test_fail_open_runtime (breaker boom, bad sink) |
| 3.3 | Backpressure sheds (503), never allows | ✅ | **HELD** | test_fail_open_runtime (shed) |
| 3.3 | Mode lookup failure/hostile body → fail-safe shadow | ✅ | **HELD** | test_fail_open_runtime (mode_client matrix) |
| 3.4 | Single-byte / delete / splice / reorder detected | ✅ | **HELD** | test_chain_tamper_logic |
| 3.4 | Cross-tenant chain confusion detected | ✅ | **HELD** | test_chain_tamper_logic (cross-tenant, genesis forge) |
| 3.4 | Canonical collision (key-order/numeric) impossible | ✅ | **HELD** (JSON-native) | test_audit_canonical_collision |
| 3.4 | Byte-for-byte parity with core | ✅ | **DEFEATED** (F-CANON-1, latent) | test_audit_canonical_collision (parity) |
| 3.4 | DB-level append-only: UPDATE/DELETE blocked | ✅ (ephemeral PG) | **HELD** | test_audit_trigger_dblevel |
| 3.4 | Append allowed; real chain verifies end-to-end | ✅ (ephemeral PG) | **HELD** | test_audit_trigger_dblevel |
| 3.4 | No alternate mutation path (bulk/ORM) reaches table | ⚠️ Partial | **HELD** (bulk delete blocked; no DELETE route) | test_audit_trigger_dblevel (bulk) + RECON §3.4 |
| 3.5 | INTERNAL_SERVICE_TOKEN unset→503, wrong→401 | ✅ | **HELD** | test_perimeter_logic (token fail-safe) |
| 3.5 | Default-safe: new tenant cannot be set to enforce | ✅ | **HELD** | test_perimeter_logic (default-safe sequences) |
| 3.5 | Every mode change is audited (who/when/from→to) | ✅ | **HELD** | test_perimeter_logic (audited change/rollback) |
| 3.5 | Audit-detail is tenant-scoped (no BOLA) | ✅ (ephemeral PG) | **DEFEATED** (F-BOLA-1) | test_perimeter_http (BOLA uuid + boundary) |
| 3.5 | Internal endpoints require auth | ✅ write / ⚠️ reads | **DEFEATED** (F-UNAUTH-1) | test_perimeter_http (unauth write) + RECON §5a |
| 3.5 | `/metrics` carries no PII / tenant identifiers | ⚠️ core only | core **HELD** / connectors **PARTIAL** | test_policy_metrics (existing) + RECON §5a (F-UNAUTH-1) |
| 3.5 | JWT alg-confusion / `none` / empty `sub` | ❌ Not reached | — | see Not-reached below |
| 3.5 | WS `/ws/notifications/{user_id}` sub==path BOLA | ❌ Not reached | — | see Not-reached below |
| 3.4 | Advisory-lock concurrent-insert fork under load | ❌ Not reached | — | see Not-reached below |

**Not reached (honest gaps):**
- **JWT verification attacks** (alg-confusion, `alg:none`, empty `sub`) — `auth.py:14-39`. Not scripted; `JWT_ALGORITHM` is server-env-controlled (not attacker-influenced), and an unset `JWT_SECRET_KEY` fails closed. Recommend a follow-up unit test.
- **WS `/ws/notifications/{user_id}` BOLA** (does the token `sub` have to equal the path `user_id`?) — `core/src/main.py:171-205`. Mapped, not executed.
- **Advisory-lock chain-fork under true concurrency** (`audit_controller.py:238`) — requires a multi-connection load harness; the DB-level suite proved single-writer chain integrity but not the concurrent-head race. Recommend a concurrency test (N parallel inserts, assert unique `chain_seq`).
- **Connectors disclosure endpoints over HTTP** (preflight/chain-health/mode-read) — identified by code inspection and folded into F-UNAUTH-1; the unauthenticated *write* was executed, the unauthenticated *reads* were not separately scripted.

---

## 4. Methodology statement (read this first, external auditor)

- **What ran:** 103 adversarial test cases in new, isolated trees —
  `backend/core/tests/adversarial/` (65: evaluator sandbox 32, determinism/resolution
  14, fail-open engine 10, fail-open runtime 9) and
  `backend/connectors/tests/adversarial/` (38: canonical-collision 6→8, chain-tamper
  logic 8→10, perimeter logic 12, DB-level trigger 6, HTTP perimeter 4). All passed; the
  "DEFEAT" tests reproduce each finding deterministically (a green suite that *documents*
  the breaks, so the findings are reproducible from this report alone).
- **Test database:** integrity/tamper and HTTP-BOLA tests ran against an **ephemeral,
  disposable `postgres:16-alpine` Docker container** (`ADV_TEST_DATABASE_URL=
  postgresql+psycopg2://qa:qa@localhost:55432/qa`), created and destroyed for the run.
  **No shared or production database was touched.** Tests that find no ephemeral DB
  **skip** — they are never pointed at the app's real `DATABASE_URL`. Reproduce with:
  ```
  docker run -d --name veldrix-qa-pg -e POSTGRES_PASSWORD=qa -e POSTGRES_USER=qa \
      -e POSTGRES_DB=qa -p 55432:5432 postgres:16-alpine
  cd backend/connectors && ADV_TEST_DATABASE_URL=postgresql+psycopg2://qa:qa@localhost:55432/qa \
      python -m pytest tests/adversarial/ -v
  docker rm -f veldrix-qa-pg
  ```
  Core adversarial tests are pure-Python:
  `cd backend/core && python -m pytest tests/adversarial/ -v`.
- **Framework revisions used (and the caveat the spec requires):** findings are anchored
  to **OWASP LLM Top 10 (2025)**, **OWASP API Security Top 10 (2023)**, **MITRE ATLAS**,
  and **NIST AI RMF 1.0**. These revisions **could not be confirmed against a live source
  from within this repo/offline environment** — the human reviewer should verify each
  cited control ID against the current published framework version before external
  publication. No control ID, CVSS number, or reproduction here was fabricated; every
  reproduction was actually executed (or, where not executed, is explicitly listed under
  "Not reached").
- **Explicitly out of scope:** pillar/detection accuracy, `route_inference()`, prompts,
  model slugs, signal production (Phase 4); any production database.
- **Actuation context (material to severity):** the Policy Engine is **not wired into any
  live request path** (RECON-QA §0: zero callers of `evaluate`/`decide`/`simulate` outside
  `src/policy/` + tests). Engine findings (F-EVAL-DOS-1, F-FAILOPEN-NAN-1, F-CANON-1) are
  therefore not currently production-exploitable; perimeter findings (F-BOLA-1,
  F-UNAUTH-1) are on the **deployed** connectors service and are.
- **Constraint compliance:** zero production-code changes; zero modifications to existing
  tests; all new work is under `tests/adversarial/` + the two `.md` reports. Two
  unrelated files (`frontend/next-env.d.ts`, `frontend/package-lock.json`) show as
  modified in `git status` — these are **auto-generated Next.js/npm artifacts** drifted by
  a background dev process, **not** touched by this QA work. Test-only Python deps
  (`python-jose`, `httpx` — both already pinned in `requirements.txt`) were installed into
  the dev virtualenv to execute the perimeter tests; no source or requirements file was
  changed.

---

## 5. Unverified appendix (observations not elevated to findings)

These are flagged honestly as **not confirmed** or **not framework-mappable as a
distinct finding**, and must not be inflated into findings.

1. **Docstring example uses lowercase `false`.** `context.py`/`evaluator.py` docstrings
   illustrate `bias_evaluated == false`, but the grammar requires Python `False`
   (lowercase `false` is rejected as an unknown field — a *fail-safe* load error). A
   policy author copying the example verbatim gets a controlled rejection, not a security
   issue. Informational doc nit.
2. **`/health/ready` returns `db: str(exc)` on failure** (`connectors/src/main.py:200`).
   Could leak a DB error string / DSN fragment to an unauthenticated caller on a failed
   readiness probe. Low-confidence info-leak; not reproduced (needs an induced DB outage).
   Worth a follow-up.
3. **Mode-cache staleness window** (`mode_client.py`, TTL 5s): after a rollback to
   `shadow`, a previously cached `enforce` persists up to the TTL. This is *bounded
   staleness in the gating direction* (it keeps enforcing slightly longer), i.e. the safe
   direction — not a fail-open. Noted for completeness, not a finding.
4. **Engine compile-cache is process-global and unbounded** (`engine.py:185`). No eviction;
   a tenant authoring many policy versions grows it without bound. Latent memory-growth /
   LLM10-adjacent, but not attacker-reachable today and not actuated. Monitor.

---

_End of report. Findings are for triage; remediation is a separate, scoped phase to be
authorized after review._
