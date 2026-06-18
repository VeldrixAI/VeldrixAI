# RECON-A.md — Phase 2 / Part A Reconnaissance (Audit Substrate Hardening)

**Status:** READ-ONLY reconnaissance complete. No files were created, edited, or deleted during this phase other than this document. **STOP — awaiting human confirmation before any Part A implementation code.**

> Scope: this recon covers ONLY the audit substrate that Part A hardens (hash chain, append-only enforcement, DELETE removal/gating). It builds on, and does not repeat, the broader Phase-1 recon in `RECON.md` (§3 there mapped the write contract; this document drills into every mutation path, the exact insert chokepoints, schema, migration ordering, read/test coupling, and the canonical-serializer reuse target).

> ⚠️ **Naming:** the core service is `backend/core/` (package `src.*`); the audit table is owned by the **connectors** service (`backend/connectors/`), a separate FastAPI app. The Phase-1 Policy Engine lives at `backend/core/src/policy/`. All paths below are real.

---

## Required Finding 1 — Every audit-write call site (the insert chokepoints the hash chain must wrap)

There are **two DB insert sites**, both in the connectors audit controller. Everything else funnels through one of them.

### 1A. Internal service-to-service insert (the load-bearing one)
**`backend/connectors/src/modules/analytics/audit_controller.py:224-269`** — `internal_log_audit()`
- Builds a row dict (`:232-243`), does app-level idempotency dedup on `(request_id, action_type)` (`:248-256`), then `db.add(entry); db.commit()` (`:258-260`).
- **This is the single endpoint every core-service write hits**: `POST /api/audit-trails/internal/audit-trail`.
- Callers from core:
  - **Policy Engine** decision/error records → `backend/core/src/policy/audit_bridge.py:53-80` (`_post`) via `emit_decision_record` (`:83-104`); payload built by `build_audit_payload` (`:37-50`) with `action_type ∈ {policy_decision, policy_engine_error}`.
  - Legacy trust eval → `backend/core/src/api/trust_controller.py` `_record_audit_trail()` (RECON §3; fire-and-forget).
  - SDK telemetry → `backend/core/src/sdk/telemetry.py` `SDKTelemetry.record()` (RECON §3).

### 1B. Public authenticated insert
**`backend/connectors/src/modules/analytics/audit_controller.py:284-307`** — `log_audit_entry()` (`POST /api/audit-trails/`)
- `db.add(entry); db.commit(); db.refresh(entry)` (`:304-306`). **No idempotency dedup here** (unlike 1A). Used for user-context writes (e.g. report create/delete actions). Frontend reaches it via `frontend/app/api/audit-trails/route.ts:54`.

> **Implication for A.2.1:** the hash chain must be computed at the **DB-insert layer inside connectors**, not in the core callers — that is the only chokepoint both sites share, and it keeps the chain logic out of the (untouched) signal-production path. Both `internal_log_audit` and `log_audit_entry` construct an `AuditTrail` and `db.commit()`; the chain assignment must wrap **both**. Recommend a single shared helper (e.g. `_insert_with_chain(db, row)`) that both call.
>
> **Idempotency ordering (critical):** in 1A the dedup check (`:248-256`) returns the existing row **without inserting** when `(request_id, action_type)` already exists. The hash/`prev_hash` must be assigned **only on the actual insert path**, *after* the dedup short-circuit — otherwise a retried decision would consume a chain slot (or fork the chain) for a row that is never written.

---

## Required Finding 2 — The DELETE endpoint and ALL other mutation paths on `audit_trails`

### 2A. The live hard-DELETE REST endpoint (the tampering vector to kill/gate)
**`backend/connectors/src/modules/analytics/audit_controller.py:527-550`** — `delete_audit_log()`
```python
@router.delete("/{log_id}", status_code=204)        # :527
async def delete_audit_log(log_id, current_user, db):
    ...
    record = db.query(AuditTrail).filter(
        AuditTrail.id == log_uuid, AuditTrail.user_id == uid).first()   # :540-544
    db.delete(record); db.commit()                  # :548-549
    return Response(status_code=204)
```
This is a casual, user-auth'd hard delete scoped only to `user_id == caller`. It is the single biggest contradiction of every immutability claim.

**Frontend coupling — removing the route is NOT self-contained:**
- Proxy handler: `frontend/app/api/audit-trails/[id]/route.ts:31-47` (`DELETE` → connectors `DELETE /api/audit-trails/${id}`).
- UI action: `frontend/app/dashboard/audit-trails/[id]/page.tsx:783-794` (`handleDelete` → `DELETE /api/audit-trails/${detail.id}`), wired to a confirm-delete button on the audit detail page.
> **Implication:** killing the backend route alone leaves a UI button that 404/405s. Part A must also remove the frontend `DELETE` proxy handler and the detail-page delete action (and the `confirmDelete`/`deleting` UI state around `:787`). This is the same PR, three files.

### 2B. UPDATE / other mutation paths
- **Runtime UPDATE on `audit_trails`: NONE.** No `db.query(AuditTrail)...update(...)`, no raw `UPDATE audit_trails`, no SQLAlchemy `onupdate` on the model (`AuditTrail` has no `updated_at`; contrast `TrustReport`). The only ORM mutation is the `db.delete` in 2A.
- **Migration-time UPDATEs (backfills, not runtime):** `006_add_audit_intelligence_fields.sql:42,47` and `scripts/verify_schema.sql:232` backfill `request_id` from JSONB. `007_audit_idempotency.sql:11-23` `DELETE`s duplicate rows before building the unique index. These run *before* any new trigger would exist and are not runtime paths — but see the **trigger-vs-backfill ordering** note in §A-Notes below.
- **No existing trigger on `audit_trails`.** The only trigger in connectors is `update_trust_reports_updated_at` on **`trust_reports`** (`000_full_schema.sql:147-150`) — unrelated.

---

## Required Finding 3 — Current schema of `audit_trails` + the idempotency index

**Model:** `backend/connectors/src/modules/reports/models/__init__.py:57-73` (`AuditTrail`).
**Base DDL:** `000_full_schema.sql:154-169`. Columns, in current effective order:

| Column | Type | Added by | Notes |
|---|---|---|---|
| `id` | UUID PK `DEFAULT uuid_generate_v4()` | 000 | primary key |
| `user_id` | UUID `REFERENCES users(id) ON DELETE SET NULL` | 000 | **nullable** — system rows have `user_id IS NULL` |
| `action_type` | VARCHAR(50) NOT NULL | 000 | e.g. `trust_evaluation`, `policy_decision` |
| `entity_type` | VARCHAR(100) | 000 | |
| `entity_id` | UUID | 000 | |
| `action_metadata` | JSONB | 000 | the full decision/signal payload |
| `ip_address` | VARCHAR(45) | 000 | |
| `user_agent` | TEXT | 000 | |
| `created_at` | TIMESTAMP `DEFAULT NOW()` | 000 | |
| `log_type` | VARCHAR(50) NOT NULL `DEFAULT 'EVALUATION'` | 006 | |
| `request_id` | VARCHAR(100) | 006 | idempotency key half |
| `related_request_id` | VARCHAR(100) | 006 | |
| `actor` | VARCHAR(255) | 006 | |

**Indexes:** `idx_audit_trails_{user_id,action_type,created_at,entity}` (000); `idx_audit_trails_{log_type,request_id,actor,related_req}` (006); composite `request_id_user_id`, `id_user_id`, GIN on `action_metadata`, partial `active` (008_audit_lookup_optimization).

**Idempotency index** (`007_audit_idempotency.sql:29-31`):
```sql
CREATE UNIQUE INDEX IF NOT EXISTS uq_audit_request_action
    ON audit_trails (request_id, action_type)
    WHERE request_id IS NOT NULL;     -- NULLs are distinct → legacy rows unconstrained
```

> **Implication for A.2.1:** the new `record_hash` / `prev_hash` columns are pure additive `ALTER TABLE ... ADD COLUMN` (nullable, no default needed). They do not collide with any existing column or index.

---

## Required Finding 4 — Migration numbering (next file)

Migrations are **raw ordered `.sql`**, applied via `psql -f` in a shell loop in the Makefile (RECON §7.1) — **not Alembic**. Connectors migrations present:

```
000_full_schema · 001_kan14_reports_audit · 002_add_trust_evaluation_type ·
003_kan16_soft_delete · 004_kan20_saved_prompts · 005_add_report_name_vx_id ·
006_add_audit_intelligence_fields · 007_audit_idempotency ·
008_add_pillar_labels · 008_audit_lookup_optimization ·   ← ⚠ DUPLICATE 008 prefix
009_policy_engine        ← Phase-1, ADDITIVE, NOT YET APPLIED
```

- **Next file is `010_audit_hash_chain.sql`** (or similarly named) under `backend/connectors/migrations/`.
- ⚠ **Two files share the `008_` prefix** (`008_add_pillar_labels` and `008_audit_lookup_optimization`). Ordering between them is undefined by the number; if the Makefile loop is lexicographic they run `add_pillar_labels` then `audit_lookup_optimization` (alphabetical). Not a Part-A blocker, but I will **not** reuse `008`/`009`; `010` is unambiguous. Flagging so a reviewer is aware the existing sequence already has one collision.
- Phase-1's `009_policy_engine.sql` is **generated-but-unapplied** (its own header says so, `:5-8`). Part A's migration is independent of it (different tables) — they can be applied in either order, but `010` documents intent to follow `009`.

---

## Required Finding 5 — Reads/tests a schema change would break

**Adding two nullable columns breaks no read.** Confirmed every reader:
- `_serialize()` (`audit_controller.py:596-648`) reads a fixed allowlist of columns + `action_metadata` keys; new columns are simply ignored unless we choose to surface them.
- `list_audit_trails` (`:312-355`), `get_audit_detail` (`:360-444`), `get_audit_intelligence` (`:449-522`), `export_csv` (`:555-591`) — all `SELECT`-by-ORM-model; additive columns are transparent.
- Frontend consumers (`frontend/app/dashboard/audit-trails/page.tsx`, `[id]/page.tsx`, `frontend/app/api/audit-trails/*`) consume the JSON `_serialize` emits — additive columns invisible until exposed.

**Tests/assets touching audit immutability (relevant, not broken):**
- `frontend/tests/specs/critical/04-audit-trails.spec.ts` — titled *"Audit Trail immutability and integrity"*. Part A finally makes its premise true; should be reviewed/extended, not broken.
- `frontend/tests/agent/prompts/audit-verification.ts:31` — attempts `PATCH /api/audit-trails/{id}` to prove tamper-resistance. No `PATCH` route exists (so it already fails-as-intended); the new trigger backs this up at the DB layer.
- `backend/core/tests/test_sdk.py` (modified in working tree) — exercises the SDK telemetry path that writes audits; verify it still passes once chain writes are added to the connectors insert (it talks to a mocked/real connectors endpoint).

> **Implication:** the schema change is read-safe. The only deliberate breakage is the **removal** of the DELETE capability (Finding 2A), which is the point.

---

## A-Notes — design inputs the implementation MUST honor (not blockers, but decisive)

**N1. Reuse the Phase-1 canonical serializer — do not invent a second.**
Phase 1's canonical hashing pattern is `schema.py:282-288` (`Policy._compute_checksum`):
```python
blob = json.dumps(self.canonical(), sort_keys=True, separators=(",", ":"))
return "sha256:" + hashlib.sha256(blob.encode("utf-8")).hexdigest()
```
That is a *method on Policy*, not a standalone payload serializer. **There is no reusable free-function canonical serializer today.** The cleanest reuse is to extract that exact recipe (`json.dumps(..., sort_keys=True, separators=(",",":"))` → `sha256:` + hex) into one shared helper and have both `Policy._compute_checksum` and the new audit-chain hasher call it — same encoding, sorted keys, `sha256:` prefix, fixed UTF-8. The audit chain hashes the row's `action_metadata` payload (which already contains the Phase-1 decision `signature()` from `engine.py:124-141`). **Decision needed:** the connectors service hashes the payload, but the canonical helper lives in `backend/core/src/policy/`. Either (a) duplicate the *tiny, identical* recipe in a connectors util with a test asserting byte-for-byte parity against core's, or (b) factor it into a shared module both import. Cross-service imports are not currently done (core and connectors are separate apps) — **(a) with a parity test is the lower-coupling choice; please confirm.**

**N2. `record_hash = sha256(canonical(payload) || prev_hash)`; genesis sentinel.**
Per A.2.1, `prev_hash` is the previous record's `record_hash` *for that tenant*. Genesis (first record per tenant) uses a fixed documented sentinel — propose `"sha256:" + "0"*64` (i.e. `GENESIS`), documented in `AUDIT_INTEGRITY.md`. The canonical payload hashed must be the stored `action_metadata` so the chain is reproducible offline from the row alone.

**N3. Per-tenant chain + the `user_id IS NULL` problem.**
The chain is per-tenant (`tenant_id = user_id`). But **many rows have `user_id IS NULL`** (system/internal writes; the list query even filters `user_id IS NULL`, `:325`). A per-tenant chain needs a deterministic key for null-tenant rows — propose a reserved sentinel tenant UUID (e.g. all-zeros) for the system chain, documented. Without this, null-tenant rows can't chain.

**N4. Concurrency — serialize inserts per tenant or the chain forks.**
`record_hash` depends on reading the tenant's current head. Two concurrent inserts for the same tenant that both read the same `prev_hash` produce a fork (two records with identical `prev_hash`). Need per-tenant serialization on the write: a Postgres advisory lock keyed on `tenant_id` (`pg_advisory_xact_lock(hashtext(tenant_id))`), or `SELECT ... ORDER BY created_at DESC LIMIT 1 FOR UPDATE`, inside the insert transaction. The fire-and-forget audit POSTs (audit_bridge, trust_controller) mean bursts of concurrent writes are realistic. **This must be designed in, not bolted on.**

**N5. Append-only trigger vs. the migration's own backfill ordering.**
A `BEFORE UPDATE OR DELETE` trigger that `RAISE`s will block migration backfills (006-style `UPDATE audit_trails`, 007-style `DELETE`). The Part-A migration likely needs to **backfill `record_hash`/`prev_hash` for existing rows first** (walk each tenant's rows by `created_at`, compute the chain), *then* `CREATE TRIGGER` — within the same migration, in that order. Document that any future legitimate schema migration touching rows must drop→recreate the trigger in an explicit, separately-reviewed step (mirrors the A.2.2 "reversible only by explicit migration" requirement).

**N6. Honesty markers — confirm what actually exists (`actuated` does NOT).**
The Phase-2 prompt lists `evaluated`, `actuated`, `enforced`, `mode` as Phase-1 honesty markers the chain must protect. Actual Phase-1 implementation:
- `enforced` (bool) — `engine.py:109,133`; `mode` — `engine.py:106,130`; per-pillar `*_evaluated` (bool, never null) — `context.py:60,69`, exposed in `signal_snapshot`; plus `engine_error` — `engine.py:119,138`.
- **`actuated` does not exist anywhere in the backend** (grep over `backend/` returns nothing). RECON.md §2.4 framed it as a *concept* ("decision verbs not yet wired to runtime"), but no field by that name was implemented. The real "intent recorded but not acted on" signal today is `enforced=false` under `shadow`/non-gating verbs (`engine.py:452-459`).
> **Implication:** the acceptance test "honesty markers are inside the hashed canonical payload" should assert on the **markers that exist** (`evaluated`/`*_evaluated`, `enforced`, `mode`, `engine_error`). Do **not** fabricate an `actuated` field to satisfy the checklist — flag the naming gap to the reviewer instead. All of these already live inside `action_metadata` (via `Decision.to_audit_metadata` → `signature()`), so they are automatically inside the hashed payload; the test just needs to prove the hash covers them.

**N7. Redaction vs. delete (A.2.3 scope call).**
A.2.3 allows either a chain-preserving redaction/tombstone path OR removing DELETE entirely with redaction as a tracked follow-up. Given (a) no GDPR-erasure caller exists today, (b) redaction-preserving-the-chain is non-trivial (re-hash semantics: tombstone the PII fields but keep the record's hashed identity stable, or hash the tombstoned form and re-link forward — a real design), recommend **remove DELETE entirely in PR 1, file redaction as a follow-up** per the prompt's own "a missing capability is safe; a tampering vector is not." Confirm this scope choice.

---

## Part-A Phase-0 checklist (per §A.1)
- [x] **1.** Every audit-write insert site located — `internal_log_audit` (`audit_controller.py:224-269`) and `log_audit_entry` (`:284-307`); all core callers funnel through the former.
- [x] **2.** DELETE endpoint located (`:527-550`) + its frontend proxy/UI coupling; confirmed **no** runtime UPDATE path and **no** existing trigger on `audit_trails`.
- [x] **3.** `audit_trails` schema + `uq_audit_request_action` idempotency index documented.
- [x] **4.** Migration numbering resolved — next is `010_*` (duplicate-`008` wart flagged; `009` is Phase-1 unapplied).
- [x] **5.** All readers enumerated — additive columns break none; only deliberate breakage is DELETE removal.
- [x] Bonus: canonical-serializer reuse target, genesis sentinel, null-tenant chain key, write concurrency, trigger/backfill ordering, and the `actuated` non-existence all flagged as decisive design inputs.

**STOP. Awaiting confirmation before any Part A implementation code or migration is written.**
