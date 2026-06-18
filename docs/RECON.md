# RECON.md — Phase 0 Reconnaissance (Policy Engine Core)

**Status:** READ-ONLY reconnaissance complete. No files were created, edited, or deleted during this phase other than this document. **STOP — awaiting human confirmation before Phase 1.**

> ⚠️ **Naming note:** The prompt (`06-policy-engine-core.md`) references `aegisai-core/`. That path does not exist in this repository. The product was renamed **AegisAI → VeldrixAI**. The core service lives at **`backend/core/`** (Python package root `backend/core/src/`, imported as `src.*`). All references below use the real paths.

> ⚠️ **Three of the prompt's stated assumptions do not hold in this codebase.** They are flagged inline and consolidated in §7. They are not blockers, but they materially change the Phase 1 design and must be acknowledged before we build:
> 1. There is **no seven-verb enforcement dispatcher** to "call as-is." Enforcement today is a **4-value verdict string** (`ALLOW | WARN | REVIEW | BLOCK`), computed in two places, and it is **advisory metadata** written to the audit trail — nothing is gated on it.
> 2. There is **no hash chain** and **no append-only DB trigger / 403 guard** on the AuditLog. The audit table is a plain JSONB table with an idempotency unique index, and a `DELETE` endpoint exists.
> 3. `policy_context` is **free-text passed into an LLM prompt**, not a structured/typed contract.

---

## 1. Where pillar signals become an enforcement action today

There are **two parallel, independent decision sites** — one per request entry path. Both compute the same 4-value verdict from already-scored pillar results, and both write it only as audit metadata.

### Site A — Legacy REST path `POST /trust/evaluate`
**`backend/core/src/api/trust_controller.py:94-111`** (inside `_record_audit_trail`)

```python
_BLOCK_TRIGGERS = {                                  # trust_controller.py:97-101
    "content_unsafe", "explicit_content_detected",
    "prompt_injection_detected",
    "policy_violation_critical", "policy_violation_high",
}
block_flags = [f for f in all_flags if f in _BLOCK_TRIGGERS]
if block_flags or composite_score < 0.40:            # :104
    verdict = "BLOCK"
elif composite_score >= 0.85:                        # :106
    verdict = "ALLOW"
elif composite_score >= 0.60:                        # :108
    verdict = "WARN"
else:
    verdict = "REVIEW"                               # :111
```
- `composite_score` = `compute_composite_trust_score(report.pillar_results)` (`ai_safety_pillars.py:270-305`), a weighted blend of per-pillar `details["nim_risk_score"]`.
- Verdict is placed in the audit payload (`:113-130`) and POSTed fire-and-forget (`:252-256`). **Nothing is enforced** — the API returns the full report regardless of verdict.

### Site B — SDK / `POST /v1/analyze` path
**`backend/core/src/sdk/client.py:342-385`** (`_aggregate_trust_score`)

```python
if critical_flags:                                   # client.py:367
    verdict = "BLOCK"
elif overall >= 0.85:
    verdict = "REVIEW" if degraded_critical else "ALLOW"   # :373
elif overall >= 0.60:
    verdict = "WARN"
else:
    verdict = "REVIEW"
```
- `critical_flags` are content flags (not operational ones — see `_OPERATIONAL_FLAGS`, `client.py:335-339`) emitted only by the `safety` and `prompt_security` pillars (`:357-363`).
- `degraded_critical` = a high-severity pillar failed to run → downgrades `ALLOW` to `REVIEW` (the closest existing thing to "fail-safe").
- Verdict travels on `TrustScore.verdict` (`sdk/models.py:34`) and is persisted via `SDKTelemetry.record()` (`sdk/telemetry.py:51`). Again **advisory only** — `sdk.analyze()` returns the result; nothing blocks.

**Implication for Phase 1:** the Policy Engine is the *first* component that will own a real, gating enforcement decision. There is no existing dispatcher to slot behind — §5 below.

---

## 2. Hardcoded thresholds being migrated into policy

These are the scattered constants the Policy Engine replaces. Two classes: **verdict thresholds** (the decision logic) and **signal-shaping thresholds** (inside pillars — these produce the *signals* the engine consumes; per the Absolute Constraints, **we do NOT touch pillar internals**, but they are catalogued so policy authors know the input semantics).

### 2a. Verdict / decision thresholds (the logic we migrate)
| Location | Threshold | Triggers |
|---|---|---|
| `trust_controller.py:104` | `composite_score < 0.40` OR block-flag | `BLOCK` |
| `trust_controller.py:106` | `composite_score >= 0.85` | `ALLOW` |
| `trust_controller.py:108` | `composite_score >= 0.60` | `WARN` |
| `trust_controller.py:97-101` | flag ∈ `_BLOCK_TRIGGERS` | force `BLOCK` |
| `sdk/client.py:367` | any `critical_flags` | `BLOCK` |
| `sdk/client.py:369,373` | `overall >= 0.85` (+ `degraded_critical`) | `ALLOW` / `REVIEW` |
| `sdk/client.py:374` | `overall >= 0.60` | `WARN` |
| `background_worker.py:29` | `overall < 0.7` | fire alert webhook |
| `api/trust_controller.py:260` | `risk_level ∈ {critical, high_risk}` | dispatch notification |

### 2b. Signal-shaping thresholds (inside pillars — DO NOT TOUCH; catalogued for input semantics)
| Location | Constant | Meaning |
|---|---|---|
| `ai_safety_pillars.py:107-114` & `score_aggregator.py:214-240` | `score≥80 & conf≥0.70 → SAFE`, `≥60 & ≥0.60 → REVIEW_REQUIRED`, `≥40 → HIGH_RISK`, else `CRITICAL` | `RiskLevel` classification |
| `ai_safety_pillars.py:668-673` | `_SEVERITY_TO_SCORE = {critical:5, high:25, medium:55, low:78}` | Pillar 4 severity→score |
| `ai_safety_pillars.py:380` | `risk_score = 0.90 if unsafe else 0.05` | Pillar 1 llama-guard |
| `ai_safety_pillars.py:487,617,868` | `risk > 0.3 → flag` | hallucination / bias / legal flag gates |
| `ai_safety_pillars.py:194` | degraded → `score=50, confidence=0.3, status=PARTIAL` | failure fallback |
| `ai_safety_pillars.py:533-534` | **`_FAST_PATH_SCORE = 92.0`**, `_FAST_PATH_NIM_RISK = 0.08` | **the "score=92" bias fast-path** (see §7.4) |

---

## 3. AuditLog write contract (consume as-is — DO NOT modify)

The "AuditLog" is the **`audit_trails`** table, owned by the **connectors** service (a separate FastAPI app), not core and not auth.

- **Model:** `backend/connectors/src/modules/reports/models/__init__.py:57-73` (`AuditTrail`).
- **Table DDL:** `backend/connectors/migrations/000_full_schema.sql:154-169`; intelligence fields added in `006_add_audit_intelligence_fields.sql`; idempotency index in `007_audit_idempotency.sql`.
- **Write endpoint (the one core calls):** `POST /api/audit-trails/internal/audit-trail` → `internal_log_audit()` at `backend/connectors/src/modules/analytics/audit_controller.py:224-269`.

**Write signature** (`InternalAuditRequest`, `audit_controller.py:215-221`):
```
action_type   : str            (required)   e.g. "trust_evaluation"
entity_type   : str | None                   e.g. "trust_evaluate" | "sdk_analysis"
entity_id     : str | None  (UUID)
user_id       : str | None  (UUID)
actor_email   : str | None
metadata      : dict | None   → stored verbatim into action_metadata (JSONB)
```
The row written also sets `log_type="EVALUATION"`, `request_id = metadata["request_id"]`, `actor = actor_email or user_id`, `created_at = utcnow()`.

**Callers from core (both fire-and-forget):**
- `trust_controller.py:68-139` `_record_audit_trail()` — builds the `metadata` blob (verdict, pillar_scores, flags, previews).
- `sdk/telemetry.py:24-78` `SDKTelemetry.record()` — same endpoint, richer `pillars{}` block.

**Idempotency:** duplicate `(request_id, action_type)` is suppressed in app code (`audit_controller.py:246-256`) and enforced by a partial unique index `uq_audit_request_action` (`007_audit_idempotency.sql:29-31`).

> ⚠️ **No hash chain. No append-only enforcement.** Searched all `.py` and `.sql`:
> - The only triggers in connectors are `update_updated_at_column` on **`trust_reports`** (`000_full_schema.sql:147-150`) — not on `audit_trails`.
> - No `prev_hash` / `record_hash` / chain column exists on `audit_trails`. The `checksum_hash` column lives on `trust_reports` only (`:102`), unrelated.
> - A **delete** path exists: `delete_audit_log()` at `audit_controller.py:528`. Migration `008_add_pillar_labels.sql:5-7` explicitly notes append-only is a *convention* ("the evaluation is the immutable record"), **not** a DB-enforced guarantee.
>
> **Phase 1 consequence:** §2.5's "write ONE immutable record … sufficient to reproduce offline" is achievable at the *payload* level (we control what we put in `metadata`), but the prompt's premise of an existing immutable/hash-chained log + 403 guard to "consume" is **not present**. We will write the full signal-snapshot + policy-version + matching-rules payload into `action_metadata` via this existing endpoint, and **must not** claim DB-level immutability we don't have. If true immutability is required, that is a separate, out-of-scope migration to flag.

---

## 4. `policy_context` contract today (Pillar 4)

- **Producer (SDK path):** `backend/core/src/sdk/pillars.py:47` — `context={"policy_context": request.context or ""}`. So the SDK's public `request.context` (a **string**) is forwarded under the `policy_context` key.
- **Producer (REST path):** `trust_controller.py:175-185` passes `request.context` straight through to `TrustEvaluationInput.context` (typed `Dict[str, Any]`, `domain/types.py:50`).
- **Consumer:** `ai_safety_pillars.py:715-720` (`PromptSecurityPillar.evaluate`):
  ```python
  policy_context: str = str(input_data.context.get("policy_context", ""))
  policy_section = f"\nBUSINESS POLICY CONTEXT:\n{policy_context}\n" if policy_context else "(no context...)"
  ```
  It is **interpolated into the LLM system/user prompt** for the policy-violation judge. Free-text only.

> ⚠️ This is **not** a structured/typed policy contract. It is an unstructured hint to an LLM judge. The Phase 1 Policy Engine introduces the *real* typed signal context (pillar scores, deterministic detector outputs, request metadata: region / action_class / data_categories / blast_radius) as its own input model. The existing `policy_context` string is a **separate concern** — it shapes how Pillar 4 produces a signal; the engine consumes that signal. We do not repurpose this key.

---

## 5. The "seven-verb enforcement dispatcher"

**It does not exist.** Exhaustive search for `allow | block | rewrite | mask | disclaimer | escalate | regenerate` as an enforcement dispatch site found:
- No function/class that accepts an action verb and applies it.
- The verbs `mask` / `escalate` appear only as **notification severity labels** — `NotificationSeverity` enum in `backend/auth/app/db/models.py:62-66` (`blocked | flagged | masked | escalated`) and notification dispatch strings (`services/notification_dispatch.py`). These describe *what a notification says happened*, not an enforcement engine.
- `rewrite` / `disclaimer` / `regenerate` appear only in unrelated report/PDF/prompt-generation code (e.g. `connectors/.../reports`, `prompts/advanced_generator.py`).
- The gateway (`gateway/traefik.yml`, `gateway/dynamic/routes.yml`) is **pure Traefik routing** — no enforcement logic.

**The only "enforcement" output in the system is the 4-value verdict** (`ALLOW | WARN | REVIEW | BLOCK`) from §1, and it is advisory metadata.

> ⚠️ **Phase 1 design decision required (for human confirmation):** the prompt instructs "DO NOT alter the seven-verb dispatcher signature; call it as-is." There is nothing to call. Options:
> - **(Recommended)** Build the Policy Engine to *return* a structured decision object whose `action` is one of the seven verbs, and have it write that decision to the audit trail. The verbs become the engine's output vocabulary. We do **not** invent a runtime that mutates/rewrites/masks model output in this PR (that touches the response path and risks the "do not change how signals are produced / no enforcement-path surprises" constraints). Mapping the seven verbs onto actual runtime effects (mask, rewrite, regenerate) is a later integration phase.
> - Alternatively, keep emitting the legacy 4-verdict alongside, derived from the engine decision, for backward-compat with the existing dashboard/SSE consumers.
> This is the single biggest scope question and should be settled before coding.

---

## 6. Sync vs. background execution model

**Both exist; the engine must support both.**

- **`POST /trust/evaluate`** (`trust_controller.py:153-281`): fully **synchronous** evaluation; audit write is fire-and-forget (`asyncio.create_task`, `:252`).
- **`POST /v1/analyze`** (`api/v1/analyze.py`): **synchronous by default**, **background-capable**. When `payload.background` is true or the latency budget sets `background_mode` (`analyze.py:77-95`), it returns an immediate "accepted" response and delegates to `BackgroundEvaluationWorker.submit()` (`evaluation/background_worker.py:43-63`), which runs `sdk.analyze()` and writes the audit trail via `SDKTelemetry.record()`.
- In **all** paths the audit-trail POST is fire-and-forget and never blocks the response.

> **Phase 1 consequence:** the Policy Engine must run as a **pure, synchronous, in-process function over already-computed signals** (no I/O, sub-ms) so it slots identically into (a) the sync `/trust/evaluate` flow, (b) the sync `/v1/analyze` flow, and (c) the background worker's `sdk.analyze()` flow. Its audit write reuses the existing fire-and-forget POST to the connectors endpoint (§3). This matches §2.6 / §2.7 of the prompt.

---

## 7. Consolidated divergences from the prompt's assumptions

These must be acknowledged before Phase 1. None are reasons to stop permanently — they are design inputs.

1. **Repo/path:** `aegisai-core/` → **`backend/core/`** (package `src.*`). Migrations are **raw ordered `.sql` files** applied via `psql -f` in a shell loop (`Makefile:105-111`), **not Alembic**. An additive policy-storage migration would be the next-numbered file (e.g. `009_*.sql`) under `backend/connectors/migrations/` (or auth), **generated and left unapplied** for review.
2. **No seven-verb dispatcher** (§5). Enforcement today = advisory 4-verdict string, computed in two places, gating nothing.
3. **No hash chain / no append-only DB trigger / no 403 guard** on the AuditLog (§3). Immutability is a *convention*, and a delete endpoint exists. "Reproduce offline from the record" is achievable via the payload we write, but we must not claim DB-enforced immutability.
4. **The `score=92` fast-path is real and confirmed** (`ai_safety_pillars.py:533-534, 556-574`). Per §2.4 the engine must surface a skipped/short-circuit evaluation as `evaluated: false` in the signal context rather than as a passing 92. Note the fast-path currently emits a genuine `SafetyScore(value=92, status=SUCCESS)` with `details["method"]="demographic_fast_path"` — the engine's signal-context builder must detect this marker (and the regex fast-paths at `:339-354`, `:696-712`, and degraded `status=PARTIAL` at `:191-199`) to set `evaluated=false`. **We read these markers; we do not change the pillar.**
5. **`policy_context` is free-text into an LLM prompt** (§4), not the typed engine input. The engine defines its own typed signal context; the existing key is left as-is.
6. **Two pillar implementations coexist:** `src/pillars/implementations/ai_safety_pillars.py` (REST path) and `src/sdk/pillars.py` (SDK path) with `src/sdk/client.py` aggregation. The engine must consume a **normalized** signal context derived from either, since both feed audit writes.

---

## 7b. Tenant/org home for `policy_enforcement_mode` (§2.8 dependency)

**No tenant/org table exists.** Searched all models and migrations:
- The identity record is **`User`** — `backend/auth/app/db/models.py:17-40` (auth DB), mirrored as `users` in connectors (`000_full_schema.sql:15`). It already carries per-tenant config columns: `plan_tier`, `plan_status` (`:35-36`).
- **`user_id` (UUID) is the de-facto `tenant_id`** across the system — it keys audit records (`audit_controller.py:234`), eval counts, latency, and notifications.
- The `org_id` symbols found are incidental: an in-memory rate-limit key (`audit_controller.py:200`) and a doc comment (`latency_budget.py:11`). Not a persisted tenant entity.

**Consequence for §2.8:** there is **no existing home** for `policy_enforcement_mode`, so per §2.8 the additive `009_*.sql` introduces it. It should live on the engine's **own** new per-tenant policy-binding storage (keyed by `tenant_id = user_id`), **defaulting to `shadow`** — not bolted onto `auth.users` (keeps the engine self-contained and avoids touching the auth model/middleware, per Absolute Constraints). **Open decision (§8a):** which service's DB owns that storage.

### §2.8 enforcement-mode design (folded into Phase 1)
- The engine **always** evaluates → resolves → writes an audit record, in every mode. Mode governs **only** whether the resolved decision is returned as gating.
- Modes: `shadow` (decide + record, `enforced=false`, gates nothing — **default for all tenants**) · `enforce` (block/escalate gate, `enforced=true`) · `enforce_critical_only` (gate `critical` only; `enforced=false` for the rest).
- Decision object MUST carry `decided_action`, `enforced: bool`, `mode`. The audit record MUST distinguish *the decision reached* from *whether it was enforced* — never imply enforcement that didn't occur, never imply a no-op when a critical decision was actually gated.
- **This resolves RECON §5/§7.2:** shadow-default means a fresh tenant gates nothing — identical to today's behavior (no dispatcher, advisory-only). Enforcement is explicit per-tenant opt-in. The "no seven-verb dispatcher exists" gap is no longer blocking: the engine emits `decided_action` (one of the seven verbs) + `enforced`, and only `enforce`/`enforce_critical_only` tenants experience gating — which still needs a future response-path integration to *apply* mask/rewrite/regenerate, but `block`/`escalate` gating is expressible as a returned decision now.

---

## 8. Proposed Phase 1 module placement (for confirmation — no code written)

- New package: `backend/core/src/policy/` — `schema.py` (policy/rule dataclasses + checksum), `evaluator.py` (sandboxed allowlisted expression evaluator, no `eval`), `resolution.py` (severity → restrictiveness → priority → order), `context.py` (typed signal-context builder incl. `evaluated:false` markers), `engine.py` (load/cache by `(policy_id, version)`, decide, dry-run `simulate()`), `audit_bridge.py` (build the §3 payload, reuse existing POST).
- Migration: additive `009_policy_storage.sql` under `backend/connectors/migrations/` (tenant policies + versions + checksum), **generated, NOT applied**, flagged for review.
- Tests: `backend/core/tests/test_policy_*.py` — determinism (1000×), sandbox-escape rejection, unknown-field error + fail_mode, missing-signal fail-closed on critical, `evaluated:false` assertion, four-level tie-break fixture, engine-exception fail-closed + `engine_error` record, no-match `default_action`, single immutable audit record, `simulate()` writes nothing, immutability-of-effective-policy raises, sub-ms perf budget.
- Docs: `POLICY_ENGINE.md` (compliance-officer readable).

---

### Phase 0 checklist (per §5 of the prompt)
- [x] Decision path located — **two** sites (§1).
- [x] Hardcoded thresholds enumerated (§2).
- [x] AuditLog write signature mapped; **hash chain / append-only guard found to be absent** and reported honestly (§3).
- [x] `policy_context` contract mapped — free-text LLM hint (§4).
- [x] Seven-verb dispatcher searched — **does not exist**; current output is a 4-verdict advisory (§5).
- [x] Sync vs. background model mapped — both; engine must be pure-sync in-process (§6).

**STOP. Awaiting confirmation before any Phase 1 code.**
