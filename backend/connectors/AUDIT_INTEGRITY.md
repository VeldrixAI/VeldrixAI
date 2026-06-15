# Audit Trail Integrity — Hash Chain & Append-Only Enforcement

_Phase 2 / Part A — Audit Substrate Hardening._

The `audit_trails` table is the system of record for every trust evaluation and
policy decision. This document describes how it is made **tamper-evident** (you
can detect after-the-fact edits) and **append-only** (the database itself
refuses to mutate or delete rows).

Before Part A, immutability was a *convention* — there was a plain JSONB table,
no integrity proof, and a user-scoped `DELETE` endpoint. Part A closes that gap.

---

## 1. The hash chain

Each row carries three columns (migration `010_audit_hash_chain.sql`; live form
in `src/main.py::_run_migrations`):

| Column        | Meaning                                                        |
|---------------|----------------------------------------------------------------|
| `record_hash` | `sha256:` digest committing to this row's identity + `prev_hash` |
| `prev_hash`   | the `record_hash` of the previous row in **this tenant's** chain |
| `chain_seq`   | per-tenant monotonic position (deterministic verification order) |

### Recipe (the single source of truth is `audit_hash.py`)

```
record_hash = "sha256:" + sha256( canonical_json(identity) + "\n" + prev_hash )

canonical_json(obj) = json.dumps(obj, sort_keys=True, separators=(",", ":"))

identity = {
    action_type, entity_type, entity_id, user_id,
    request_id, created_at (ISO-8601), action_metadata
}
```

`canonical_json` is **byte-for-byte identical** to the core Policy Engine's
checksum recipe (`backend/core/src/policy/schema.py`). The two services are
separate deployables and do not import each other, so the recipe is deliberately
duplicated; `tests/test_audit_hash.py` asserts parity and pins a known vector so
neither side can silently drift.

The hash commits to the **whole row identity**, not just `action_metadata` — so
editing any field (verdict, actor, timestamp, the honesty markers `enforced` /
`mode` / `*_evaluated` / `engine_error` that live inside `action_metadata`)
invalidates `record_hash` and every hash after it.

### Genesis & per-tenant chains

- **Genesis link:** the first record in a tenant's chain uses
  `prev_hash = GENESIS_HASH = "sha256:" + "0"×64`.
- **Per-tenant:** the chain key is `user_id`. Many rows are system/internal
  writes with `user_id IS NULL`; those share one **system chain** under the
  reserved tenant UUID `00000000-0000-0000-0000-000000000000`.

### Concurrency

`record_hash` depends on reading the tenant's current head, so concurrent writes
for the same tenant could fork the chain. Every insert therefore takes a
**per-tenant Postgres advisory lock** (`pg_advisory_xact_lock(hashtext(key))`,
transaction-scoped) before reading the head and writing — serializing writers
per tenant. The fire-and-forget audit POSTs from the core service make
concurrent bursts realistic, so this is designed in, not bolted on.

---

## 2. Append-only enforcement

A database trigger makes the table append-only **even against direct SQL**:

```sql
CREATE TRIGGER audit_trails_append_only
    BEFORE UPDATE OR DELETE ON audit_trails
    FOR EACH ROW EXECUTE FUNCTION audit_trails_block_mutation();  -- RAISEs
```

There is no longer any `DELETE` route (the old user-scoped hard-delete endpoint
was removed, along with its frontend proxy and the detail-page delete button).

> **Future legitimate migrations** that must touch existing rows have to
> `DROP TRIGGER audit_trails_append_only`, migrate, then recreate it — as an
> explicit, separately-reviewed step. The Part-A backfill itself does exactly
> this: it adds the columns, drops any existing trigger, backfills the chain for
> pre-existing rows (in `(tenant, created_at, id)` order from genesis), then
> creates the trigger. Backfill **must** precede trigger creation, or the
> trigger blocks its own UPDATEs.

---

## 3. Verifying a chain

`audit_hash.verify_chain(rows)` takes one tenant's rows ordered by `chain_seq`
ascending and returns `None` if intact, otherwise a description of the first
broken link. It detects:

- **tampering** — a stored field was edited (`record_hash` no longer recomputes);
- **deletion** — a link is missing (`prev_hash` of the next row doesn't match);
- **reordering** — rows out of chain order.

Because the preimage is fully reproducible from the stored row, verification
needs nothing but the rows themselves — it works offline.

---

## 4. Scope / follow-ups

- **GDPR-style erasure** is intentionally **not** implemented here. A missing
  capability is safe; a casual delete is a tampering vector. If erasure is ever
  required it must be a **chain-preserving redaction** path (tombstone the PII
  fields while keeping the record's hashed identity verifiable) — tracked as a
  separate, explicitly-reviewed change.
- **Honesty markers:** the chain protects, but does not invent, the Phase-1
  markers (`enforced`, `mode`, per-pillar `*_evaluated`, `engine_error`). There
  is no `actuated` field in the backend; the "intent recorded but not acted on"
  signal is `enforced = false` under `shadow` / non-gating verbs.
