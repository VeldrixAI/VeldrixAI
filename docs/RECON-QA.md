# RECON-QA.md — Phase 3 Adversarial QA Reconnaissance (READ-ONLY)

> **Status:** Phase 0 surface map complete. **No attacks run, no code modified.**
> Per `08-adversarial-qa-verification.md` §7, execution **STOPS here for review**
> before any adversarial test is written or executed.
>
> **Scope reminder:** this maps the *engine + substrate + service perimeter* of
> Phases 1–2. It does **not** assess pillar/detection *accuracy* (Phase 4). Every
> §3 attack below targets "can it be tricked / broken / bypassed / made to
> fail-open?", never "is the score correct?".

---

## 0. Repository facts that shape every attack

| Fact | Evidence | Why it matters to QA |
|------|----------|----------------------|
| **The Policy Engine is NOT wired into any live request path.** No caller of `runtime.evaluate()`, `engine.decide()`, or `engine.simulate()` exists outside `backend/core/src/policy/` and the test tree. | `grep` for `runtime.evaluate` / `.decide(` / `.simulate(` across `backend` excluding `src/policy/` and `/tests/` → **0 hits**. | The engine's guarantees are testable only **in isolation**. In production today, **no request flows through it** — the `actuated:false` / `enforced` markers are honest. Findings must state this so severity is not inflated into "production-exploitable" when the path is dormant. |
| **Two separate deployables**: `core` (8001) and `connectors` (8002); they do not import each other and talk over HTTP. | `mode_client.py:29`, `audit_bridge.py:30`. | Canonical-hash parity (§3.4) is *duplicated*, not shared — a real drift surface. |
| **Connectors has no SQL migration runner.** Schema = SQLAlchemy `create_all()` + a Python startup hook `_run_migrations()`. The `.sql` files are review artifacts, **not** the execution path. | `main.py:21`, `main.py:33-106`; `010_*.sql:7-10`; `011_*.sql:11-17`. | The append-only trigger and chain backfill that §3.4 attacks live in `main.py:_run_migrations`, **not** in the `.sql`. Test the executed path. |
| **Ephemeral test DB is available** via Docker (`docker 29.1.3` present; `docker-compose.yml:10` pins `postgres:16-alpine`). `DATABASE_URL` is unset in this shell; existing connectors tests are **DB-free** (`test_enforcement_rollout.py` fakes the session; `test_audit_hash.py` is pure Python). | `docker --version`; `docker-compose.yml:9-11`; `db/base.py:11`. | §3.4 DB-level trigger / advisory-lock / cross-tenant tests **require Postgres** (plpgsql `RAISE EXCEPTION`, `pg_advisory_xact_lock`, `hashtext()` — none exist in SQLite). Plan: spin an **ephemeral `postgres:16-alpine` container**, apply `_run_migrations()`, attack, destroy. **No shared/production DB will be touched.** This satisfies the §4 constraint; it is **not** a blocking finding. |
| **All 82 → 154 `def test_` functions are author-written correctness tests.** | `grep -rc def test_` → 154 across core+connectors. | They share the authors' blind spots — exactly what this phase exists to probe. |

---

## 1. Domain 3.1 — Condition Evaluator Sandbox Escape  `[OWASP LLM01-adjacent / code-exec]`

**File under attack:** `backend/core/src/policy/evaluator.py`

| Surface element | file:line | Claimed guarantee |
|---|---|---|
| AST allowlist (node types) | `evaluator.py:75-84` (`_ALLOWED_NODES`) | Only boolean ops, comparisons, fields, literals; everything else rejected at compile. |
| Constant-type allowlist | `evaluator.py:87` (`_ALLOWED_CONST_TYPES`) | Only `str/int/float/bool/None` literals. |
| `compile_condition()` — parse + validate | `evaluator.py:130-151` | All escape attempts rejected at **load** time, never deferred. |
| `_validate()` recursive walker | `evaluator.py:154-181` | Rejects `ast.Name` not in declared fields; rejects store-context; rejects disallowed literals. No `ast.Call`/`ast.Attribute`/`ast.Subscript` in allowlist → calls, `x.__class__`, `x[0]` rejected. |
| Hand-written tree-walk interpreter | `evaluator.py:200-263` (`_eval_node`) | "We never call `eval`, `exec`, `compile`, `pickle`, or any builtin" (`evaluator.py:4-6`). |
| Comparison/boolean operator table | `evaluator.py:188-197`, `:201-244` | Allowlisted operators only; type errors → `ConditionRuntimeError` → `fail_mode`. |
| Strict-bool result requirement | `evaluator.py:118-122` | A condition must yield a `bool`; a bare field reference is a malformed rule, not a silent truth. |

**Attack vectors to write (tests/adversarial/test_evaluator_sandbox.py):**
- Function-call syntax (`__import__('os')`, `len(x)`), attribute traversal (`safety_score.__class__.__mro__`), subscript (`data_categories[0]`), dict/set/comprehension/lambda/f-string/walrus/starred literals → expect `ConditionCompileError` at `compile_condition`.
- **Unicode homoglyph operators / field names** (e.g. Greek/fullwidth look-alikes of `and`, `or`, `in`, or of a field name) → does `ast.parse` + the `node.id not in fields` check (`evaluator.py:165`) reject them, or can a homoglyph field name slip the allowlist?
- **Type-confusion operands**: `region in safety_score` (string `in` number), `data_categories < blast_radius` (list vs int) → must raise `ConditionRuntimeError` (`evaluator.py:235-240`), never crash the process or coerce.
- **Resource exhaustion**: deeply nested boolean/comparison expression (thousands of `or`) → does `ast.parse` or the recursive `_validate`/`_eval_node` blow the Python recursion limit / hang? (DoS at *compile* time = `load_policy`.)
- **Dunder / name leakage**: any name resolving to a builtin or object graph → confirm it is "unknown field" rejected (`evaluator.py:165-169`, defense-in-depth re-check `:246-249`).
- Map results to OWASP LLM01 (injection-into-policy-field) and a generic code-exec / sandbox-escape claim.

---

## 2. Domain 3.2 — Determinism & Resolution Integrity  `[NIST AI RMF MEASURE]`

**Files:** `backend/core/src/policy/resolution.py`, `engine.py`, `schema.py`

| Surface element | file:line | Claimed guarantee |
|---|---|---|
| Precedence sort key | `resolution.py:59-67` (`_sort_key`) | severity → restrictiveness → priority → document-order, strictly in that order. |
| `resolve()` winner + tie-break explanation | `resolution.py:70-95`, `_explain` `:98-121` | "Same set of matching rules always yields the same winner" and reports *which* level decided. |
| Severity / restrictiveness / priority ranks | `schema.py:66-101` | Total orderings; ties fall through to next level. |
| Checksum determinism | `schema.py:273-288` (`canonical`, `_compute_checksum`) | SHA-256 over `sort_keys=True, separators=(",",":")` canonical form; same logical policy → same checksum. |
| Immutability / version bump | `schema.py:222-315` (`__post_init__` lock, `__setattr__`, `new_version`) | Effective policy is frozen; change = new version + fresh checksum; supplied-checksum mismatch raises. |
| Compile cache keyed by `(policy_id, version)` | `engine.py:192-214` | Re-load with different checksum at same version raises (immutability). |
| `Decision.signature()` volatile-free core | `engine.py:124-141` | Identical inputs → identical signature (excludes `request_id`/timestamp). |

**Attack vectors (tests/adversarial/test_determinism_resolution.py):**
- **Concurrency**: same `(policy, context)` across many threads / asyncio tasks → assert byte-identical `Decision.signature()`; probe the module-global compile cache (`engine.py:185`) for a data race; probe `mode_client._cache` (`mode_client.py:36`) race in mode resolution.
- **Four-way precedence tie**: rules equal on severity+restrictiveness+priority → must resolve on `order_index` deterministically (`resolution.py:118-121`); shuffle document order and confirm the winner *changes only when document order is the legitimate decider*.
- **Integer-overflow / extreme priority**: `priority = ±2**63`, equal severity → does the negate-for-sort (`resolution.py:65`) stay correct? (Python ints are unbounded — confirm no truncation, and that a huge priority can't invert severity precedence.)
- **Malformed / contradictory / empty policies**: empty `rules`, single always-failing condition, duplicate rule ids (`schema.py:237-238` should raise), contradictory actions at equal severity.
- **Checksum collision / forgery**: can two *different* rule sets canonicalize to the same blob (key-ordering, numeric `1` vs `1.0`, unicode)? (Shared concern with §3.4.)
- Map to NIST AI RMF **MEASURE** (verifiable determinism) and MANAGE (change-control via versioning).

---

## 3. Domain 3.3 — Fail-Open Hunting  `[OWASP LLM06 Excessive Agency — the cardinal sin]`

**Files:** `engine.py`, `context.py`, `runtime.py`, `mode_client.py`

| Failure mode | file:line | Claimed safe behavior |
|---|---|---|
| Engine internal exception | `engine.py:274-306` | Any engine fault → `BLOCK` / `CRITICAL` / `fail_closed`, recorded with `engine_error=true`. Never a silent allow. |
| Rule condition errors (missing signal / unknown field / runtime) | `engine.py:334-378` | `fail_closed` → worst-case action (`_failclosed_action` `:442-449`: critical→BLOCK else ESCALATE); `fail_open` → recorded errored + non-firing, **never silently false**. |
| No rule matches | `engine.py:391-401` | Policy `default_action` applies — "never implicit allow" (author must set escalate/block for regulated tenants). |
| **score=92 demographic fast-path** | `context.py:166-197` (`_interpret_result`), `:129-152` | `method == "demographic_fast_path"` or fallback/partial/None → `evaluated=False`, `*_score`/`*_risk` set to **None** (suppressed). A rule referencing the missing `bias_score` *errors* → `fail_mode`; can never read 92 as a pass. |
| `*_evaluated` never-null normalization | `context.py:69`, `:89-94` | `*_evaluated` always a concrete bool; missing → `False`, never None/absent. |
| Timeout budget → partial signals | `runtime.py:181-207` | On collection timeout, proceed with signals collected; missing pillars stay **absent** → `evaluated:false` → engine fails closed for high/critical. "NEVER a fabricated pass." |
| Signal-collection exception | `runtime.py:195-201` | Captured as `collection_error`, decision still computed on whatever arrived (missing → fail-closed). |
| Backpressure shed | `runtime.py:162-175` | Shed with `BackpressureError` (503-class) — rejects work, does **not** queue/allow. |
| Breaker-state introspection failure | `runtime.py:209-217` | Breaker read failure "must never break a decision" — degrades to empty state, decision proceeds. |
| Mode resolution failure | `mode_client.py:39-83` | Any lookup failure / unknown mode / 404 → **fail-safe `shadow`**. "A lookup error must NEVER silently escalate a tenant *into* enforce." (Note: shadow means `enforced=false` — de-gate, which is the safe direction.) |
| `_compute_enforced` gating | `engine.py:452-471` | shadow never gates; enforce gates block/escalate; critical-only gates only critical. Non-gating verbs never set `enforced=true` (no response-path runtime). |

**Attack vectors (tests/adversarial/test_fail_open.py):**
- Force **every** mode above; assert the resulting `Decision` never has `decided_action == ALLOW` with `enforced` silently true, and that `evaluated:false` never coerces to a passing numeric score.
- **score=92 boundary probe**: craft a `PillarResult` stand-in with `details.method == "demographic_fast_path"` and `score=92`; confirm `bias_score is None` and a rule `bias_score >= 80` *errors → fail_closed*, not "matches as safe".
- **NaN / Inf / null score injection**: `score_value = float('nan')`/`inf` reaching `_interpret_result` (`context.py:194-196`) and comparisons (`evaluator.py:235`) — does a NaN comparison (always False) create a silent non-match that reads as pass? Critical to test against a critical rule.
- **Missing critical signal**: critical-severity rule whose condition references an absent pillar → must `fail_closed` to BLOCK (`engine.py:336-359`).
- **Partial signal mid-shed**: timeout leaves only low-value pillars present while a critical pillar is missing.
- **Engine-error path**: monkeypatch `resolve`/`load_policy` to raise → assert `engine_error` record + BLOCK, and that `decide()`'s audit-sink failure (`engine.py:248-254`) does **not** convert the block into a pass.
- Map to OWASP **LLM06** (excessive agency / silent allow) and NIST AI RMF MANAGE.

---

## 4. Domain 3.4 — Audit Chain Tamper-Evidence  `[NIST AI RMF MANAGE / integrity]`

**Files:** `audit_hash.py`, `audit_controller.py`, `main.py:_run_migrations`, `010_*.sql`

| Surface element | file:line | Claimed guarantee |
|---|---|---|
| Canonical serializer (connectors copy) | `audit_hash.py:44-46` (`canonical_json`) — `sort_keys, separators=(",",":"), default=str` | Byte-for-byte parity with core `schema.py:287`. **Note divergence to probe:** connectors adds `default=str`; core does **not**. |
| Record-hash preimage | `audit_hash.py:55-95` (`canonical_identity`, `compute_record_hash`) | `sha256(canonical(identity) "\n" prev_hash)`; commits to action_type/entity/user/request_id/created_at/metadata. |
| Genesis + system-tenant sentinels | `audit_hash.py:34-39` | Fixed genesis; NULL-user rows share the all-zeros "system tenant" chain. |
| `verify_chain()` | `audit_hash.py:105-135` | Detects first broken/ tampered link (prev_hash mismatch or recompute mismatch). |
| Per-tenant chained insert + advisory lock | `audit_controller.py:222-267` (`_insert_with_chain`) | `pg_advisory_xact_lock(hashtext(tenant))` serializes writers so concurrent inserts can't fork the chain; head read by `chain_seq DESC`. |
| Append-only DB trigger (executed path) | `main.py:84-98`; documented `010_*.sql:46-57` | `BEFORE UPDATE OR DELETE` → `RAISE EXCEPTION` — append-only even against direct SQL. |
| DELETE endpoint deliberately removed | `audit_controller.py:583-592` (comment block; no route) | No delete route; trigger enforces at DB layer. |
| Backfill ordering | `main.py:48-82` | Backfill runs **after** `DROP TRIGGER` and **before** re-create — re-run safe. |

**Attack vectors (tests/adversarial/test_audit_chain_tamper.py — ephemeral Postgres):**
- **Direct DB UPDATE and DELETE** against `audit_trails` → assert the trigger raises (`check_violation`). Both verbs, both system-tenant and user-tenant rows.
- **Single-byte alteration** of a stored `action_metadata` → `verify_chain` must flag `tampered`.
- **Chain splice / mid-chain insert / reorder** → `verify_chain` must flag `chain break`.
- **Cross-tenant chain confusion**: forge a row in tenant B using tenant A's `prev_hash`/`record_hash` → must fail verification (the `user_id` is inside the preimage, `audit_hash.py:75-83`).
- **Canonical-serialization collision (MANDATORY per §6):** attempt two *different* `action_metadata` payloads with the same canonical form via (a) key reordering, (b) numeric `1` vs `1.0` vs `1.00`, (c) whitespace, (d) Unicode NFC/NFD normalization, (e) the `default=str` divergence (`audit_hash.py:46`) — e.g. does a Python object that stringifies identically to a distinct value collide? State held/defeated explicitly.
- **Advisory-lock fork**: concurrent inserts for the same tenant under load → can two rows read the same head and both claim `chain_seq=n`? (Needs Postgres + concurrency.)
- **Alternate mutation paths**: confirm no bulk-update, ORM cascade, or admin route reaches `audit_trails` (grep `delete`/`update` on the table). Note `internal_log_audit` rollback path (`audit_controller.py:325-328`) and the dedup short-circuit (`:304-313`).
- Map to NIST AI RMF **MANAGE** + integrity.

---

## 5. Domain 3.5 — Service Perimeter  `[OWASP API Security Top 10]`

### 5a. Externally-reachable endpoints and their auth gate (the perimeter map)

| Service | Method + path | Auth gate | file:line | Notes for attack |
|---|---|---|---|---|
| connectors | `POST /api/policy/internal/enforcement-mode` (mode change) | **`INTERNAL_SERVICE_TOKEN`**, fail-safe 503 if unset | `policy_controller.py:71-88`; `require_internal_token` `:26-39` | §3.5 token unset/empty/malformed → must 503, **not** open. Test BOLA: actor changes another tenant. |
| connectors | `POST /api/policy/internal/enforcement-mode/rollback` | `INTERNAL_SERVICE_TOKEN` | `policy_controller.py:91-104` | Same token gate. |
| connectors | `GET /api/policy/internal/enforcement-mode` (read mode) | **NONE** (only `get_db`) | `policy_controller.py:57-68` | Unauthenticated; discloses any tenant's mode by `tenant_id` query. Designed service-to-service (`mode_client`), but is it network-isolated? |
| connectors | `GET /api/policy/internal/preflight-report` | **NONE** | `policy_controller.py:107-115` | **Unauthenticated; discloses per-tenant decision volume + would-gate blast-radius for ANY `tenant_id`.** BOLA / sensitive-data-exposure candidate. |
| connectors | `GET /api/audit-trails/internal/chain-health` + `POST .../refresh` | **NONE** | `chain_health_controller.py:20-29` | Unauthenticated; triggers DB verification for any/all tenants (unbounded resource consumption + per-tenant chain-length disclosure). |
| connectors | `POST /api/audit-trails/internal/audit-trail` | **NONE** | `audit_controller.py:281-328` | Unauthenticated internal write. Can an attacker inject forged audit rows / poison a tenant chain / force the 500 path (`:325-328`) to leak `exc`? |
| connectors | `GET /api/audit-trails/{request_id}/detail` | `get_current_user` (JWT) | `audit_controller.py:418-502` | **BOLA: the "unscoped fallback" at `:478-501` returns another user's record on user_id mismatch** (`return _serialize(any_r)`). High-value finding candidate (API1:2023). |
| connectors | `GET/POST /api/audit-trails/...` (list, export, intelligence, public write) | `get_current_user` | `audit_controller.py:343-580` | Scoped to caller; intelligence endpoint has its own rate-limit (`:207-217`). |
| connectors | `GET/POST /api/metrics/{pillars,correlations,latency,feedback}` | `get_current_user` | `metrics_controller.py:67-312` | Scoped. `feedback` writes labels — probe cross-tenant `evaluation_id` (scoped by `user_id` at `:213-218`). |
| connectors | `GET /metrics` (Prometheus) | **NONE** | `main.py:173-184` | Exposition of `chain_metrics`. **Per-tenant labels = user UUIDs** (`chain_metrics.py:59-78`, `tenant` label) + chain length/intact/timestamp → per-tenant existence + volume cardinality leak to any scraper. No record *content*, but tenant identifiers + counts. |
| connectors | `GET /health`, `GET /health/ready` | NONE | `main.py:187-205` | `/health/ready` returns `db: str(exc)` on failure (`:200`) → DB error/DSN leak candidate. |
| core | `GET /metrics` (Prometheus) | **NONE** | `main.py:150-163` | `policy_metrics` — **closed low-cardinality label sets only** (`policy_metrics.py:9-10, 64-131`); no tenant id. Verify no PII (asserted by `test_policy_metrics.py`). |
| core | `POST /api/v1/analyze`, `GET /api/v1/pillars,health,health/providers,health/circuit-breaker` | mixed (JWT on analyze; health open) | `analyze.py:37-172` | Out of *engine* scope but part of perimeter; circuit-breaker health endpoints expose provider state. |
| core | `POST /api/.../trust` | `verify_jwt_token` (JWT) | `trust_controller.py:146-155` | JWT-gated. |
| core | `GET /internal/latency-stats`, `/internal/background-queue` | `_require_internal_key` | `internal.py:25-91` | Internal-key gated. |
| core | `WS /ws/notifications/{user_id}` | JWT via `?token=` | `main.py:171-205` | Probe: does token's `sub` have to match the path `user_id`? (BOLA over WS.) |

**JWT verification** (connectors): `auth.py:14-39` — `JWT_SECRET_KEY` from env (if unset → all tokens fail = fail-closed), `JWT_ALGORITHM` default HS256. Probe: alg-confusion only if `JWT_ALGORITHM` is attacker-influenced (it is server env — likely not), `none` alg, empty/missing `sub`.

**Attack vectors (tests/adversarial/test_perimeter.py + a small httpx/ASGI harness or unit-level calls):**
- `INTERNAL_SERVICE_TOKEN` **unset / empty / wrong** on the two POST mutators → assert 503 (unset) / 401 (wrong), **never** a successful mode change. (Crown jewel: enforce can't be flipped unauthenticated.)
- **Default-safe invariant under attack** (crown jewel #3): any sequence of API calls that lands a new/unconfigured tenant in `enforce`/`enforce_critical_only`? `validate_transition` (`mode_service.py:61-78`) blocks `None→enforce`; race a binding-create against a mode-set; try the DB CHECK constraint bypass (`011_*.sql:38-40`).
- **BOLA on `/detail` unscoped fallback** (`audit_controller.py:478-501`) — construct a request_id owned by tenant B, call as tenant A, assert whether B's record is returned (expected: **defeated**, i.e. it leaks).
- **Mode-change without audit**: can `change_mode` ever succeed without `_chain_insert` writing the who/when/from→to row? (`mode_service.py:186-207`).
- **`/metrics` cardinality / tenant disclosure** (connectors): scrape and assert presence of tenant UUID labels + counts (crown jewel #4 — partial: identifiers+volume, not content).
- **Error leakage**: force 500 on `internal_log_audit` and `/health/ready`; assert no stack trace / DSN / token / schema in body. Core's generic handler (`main.py:150-157`) returns a generic message — verify connectors does too.
- Map to OWASP API1 (BOLA), API2 (broken auth), API3 (BOPLA), API5 (broken function-level auth), API7 (SSRF/n-a), API8 (misconfig), API9 (improper inventory — undocumented `include_in_schema=False` internal routes), API10 (unsafe consumption / unbounded scrape).

---

## 6. Where guarantees are *claimed* (so §3 can test the claim, not a strawman)

| Claim (verbatim location) | Tested by domain |
|---|---|
| "no `eval`/`exec`/`compile`/`pickle`/any builtin" — `evaluator.py:4-6` | 3.1 |
| "All sandbox-escape attempts … rejected HERE, at load time — never deferred" — `evaluator.py:134-137` | 3.1 |
| "Same set of matching rules always yields the same winner" — `resolution.py:11-12` | 3.2 |
| "identical inputs → identical signature" — `engine.py:125` | 3.2 |
| "fail closed on ANY engine fault … never a silent allow" — `engine.py:274-277` | 3.3 |
| "A skipped evaluation is never a pass" — `context.py:11-22` | 3.3 |
| "missing ones stay absent … the engine fails closed … never a silent pass" — `runtime.py:13-15` | 3.3 |
| "No degradation path can produce a silent allow" — `runtime.py:20-21` | 3.3 |
| "A lookup error must NEVER silently escalate a tenant into enforce" — `mode_client.py:11-13` | 3.3 / 3.5 |
| "any tampering — including a deleted link — is detectable" — `audit_hash.py:6-8` | 3.4 |
| "byte-for-byte parity with core" — `audit_hash.py:9-22` | 3.4 (probe the `default=str` divergence) |
| "append-only at the DB layer, even against direct SQL" — `main.py:84-85`, `010_*.sql:16-17` | 3.4 |
| "Fail-safe: if no token … mode changes are *disabled* (503) rather than open" — `policy_controller.py:28-31` | 3.5 |
| "a new/unconfigured tenant can only be created as shadow" — `mode_service.py:10-13`, `:61-78` | 3.5 |
| "no governed content / PII may ever enter a metric" — `policy_metrics.py:7-10` | 3.5 |
| "Every change writes its own tamper-evident audit record (who/when/from→to)" — `mode_service.py:8-11` | 3.4 / 3.5 |

---

## 7. Coverage pre-statement (honesty about what Phase 0 reached)

- **All five domains have a concrete file:line surface map** above. ✔
- **Every externally-reachable endpoint is enumerated with its auth gate** (§5a). ✔
- **Ephemeral-DB path is identified** (Docker `postgres:16-alpine`); §3.4 DB-level tests are *feasible* and will run there, **never** against shared data. ✔ (not a blocker)
- **Not yet attacked** (correctly — Phase 0 is read-only): nothing has been executed. All "attack vectors" above are *planned*, results are TBD in `SECURITY_FINDINGS.md`.
- **Out of scope (restated):** pillar/detection accuracy; `route_inference()`; prompts/model slugs; any production DB.
- **Framework-revision caveat:** the report will pin the OWASP LLM Top 10, OWASP API Security Top 10, MITRE ATLAS, and NIST AI RMF revisions used; any I cannot confirm from within the repo/knowledge will be **flagged for human verification against the live framework version**, never assumed.

---

## 8. Two observations already visible during recon (NOT yet confirmed findings)

> Listed here for the reviewer's awareness only. Each will be **independently
> reproduced** with an executed adversarial test before it appears in
> `SECURITY_FINDINGS.md`; neither is asserted as a finding yet.

1. **BOLA via the audit-detail "unscoped fallback"** — `audit_controller.py:478-501` returns another tenant's audit record (`return _serialize(any_r)`) when the request_id exists but `user_id` mismatches. Candidate OWASP **API1:2023 (BOLA)**.
2. **Unauthenticated per-tenant disclosure** — `GET /api/policy/internal/preflight-report` and `GET /api/audit-trails/internal/chain-health` (and the `GET /metrics` per-tenant UUID labels) have **no auth gate** and accept arbitrary `tenant_id`. Candidate OWASP **API5 / API3 / API10**.

---

**STOP.** Surface mapped. Awaiting review before writing or running any adversarial
test (`08-…md` §7 step 1). On approval: build `tests/adversarial/` per domain →
execute (DB-level tests on an ephemeral `postgres:16-alpine`) → author
`SECURITY_FINDINGS.md` with framework-mapped, reproducible findings.
