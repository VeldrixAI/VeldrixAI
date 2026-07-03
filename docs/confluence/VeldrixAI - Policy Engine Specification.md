# VeldrixAI — Policy Engine Specification

> **Page status:** Current · **Last updated:** 2026-07-03 · **Audience:** Engineering, compliance, customer success
> **Source of truth:** `backend/core/src/policy/` (schema, evaluator, resolution, engine) · long-form narrative in `docs/POLICY_ENGINE.md`

## Purpose

The five trust pillars produce **signals** (scores and flags). The Policy Engine turns those signals into an **enforcement decision** using rules the **customer** authored, versioned, and can show an auditor. It never re-judges content — it consumes pillar signals, decides deterministically, records immutably, and fails safe.

**The core guarantee: identical inputs + identical policy version → identical decision, forever.**

## Vocabulary

### The seven enforcement actions (least → most restrictive)

`allow` → `disclaimer` → `mask` → `rewrite` → `regenerate` → `escalate` → `block`

> **Current scope:** only `block` and `escalate` can actually *gate* traffic. The other four are fully decided and recorded but applying them needs a response-rewriting runtime that is a later phase — such decisions are recorded with `enforced=false`. **We never claim an enforcement that did not happen.**

### Severity
Each rule carries `low` / `medium` / `high` / `critical`. Severity is the first conflict tiebreaker and drives the fail-safe default.

### Signal context (what a rule can reference — nothing else)

| Family | Fields | Meaning |
|---|---|---|
| Pillar scores | `safety_score`, `bias_score`, `hallucination_score`, `prompt_security_score`, `compliance_score` | 0–100, higher = safer |
| Pillar risks | `safety_risk`, `bias_risk`, … | 0–1, higher = riskier |
| Evaluated flags | `safety_evaluated`, `bias_evaluated`, … | Did the pillar actually assess this? |
| Composite | `composite_score` | 0–1 overall trust |
| Request metadata | `region`, `action_class`, `data_categories`, `blast_radius` | Request context |

Unknown names are rejected **at policy load time** — a typo can never become a silent no-op rule.

## Policy structure

A **policy** is data, not code: a versioned document with an ordered list of **rules** plus a `default_action`. A rule = `id`, `description`, `condition`, `action`, `severity`, optional `priority`, `fail_mode`.

**Versioning & immutability:** a policy carries a `version` and a sha256 `checksum` of its rules. An effective policy can never be modified in place — changes create a new version; old versions remain permanent addressable artifacts. Every decision is tied to exact version + checksum.

## Condition language (sandboxed)

Conditions are a deliberately tiny, allowlisted AST expression language — **no code execution possible** (no function calls, attribute access, indexing, arithmetic, or unknown names; all rejected at load time).

Permitted: comparisons (`== != < <= > >=`), membership (`in`, `not in`), boolean logic (`and or not`), declared signal fields, literals (numbers, strings, `True/False/None`, literal lists).

| Intent | Condition |
|---|---|
| Block clearly unsafe content | `safety_score < 40` |
| Escalate when bias wasn't assessed | `bias_evaluated == False` |
| Mask PII in regulated regions | `region in ['EU','UK'] and 'pii' in data_categories` |
| Disclaimer on shaky legal claims | `compliance_score < 70 or hallucination_risk > 0.5` |

## Conflict resolution (deterministic, four levels)

When multiple rules match, the winner is chosen by the first level that separates candidates:

1. **Severity** — critical > high > medium > low
2. **Restrictiveness** — block > escalate > regenerate > rewrite > mask > disclaimer > allow
3. **Priority** — higher number wins (explicit override)
4. **Document order** — earlier rule wins

The audit record names the winner **and which level decided it**, in plain language, plus every rule that matched (so runners-up are explainable).

## Fail-safe behavior (never a silent allow)

| Situation | Behavior |
|---|---|
| Required signal missing, rule is `fail_closed` | Rule fires with worst-case action (`block` if critical, else `escalate`) |
| Required signal missing, rule is `fail_open` | Rule does not fire, but the error is recorded |
| Default fail mode | `high`/`critical` rules fail **closed** unless explicitly configured otherwise |
| Skipped evaluation | The bias fast-path score 92 is surfaced as `bias_evaluated=false` with **no score** — a skipped check is never a pass |
| No rule matched | Policy's declared `default_action` (regulated tenants: `escalate`/`block`, never implicit allow) |
| Engine internal error | Fails closed to `block` (treated critical), record explicitly marked `engine_error` |

## Enforcement modes (shadow by default)

The engine **always evaluates, resolves, and records** — mode only governs whether the decision is acted on:

| Mode | Effect |
|---|---|
| `shadow` *(default for every tenant)* | Decide + record, gate nothing |
| `enforce_critical_only` | Only `critical` block/escalate decisions gate |
| `enforce` | block/escalate decisions gate traffic |

A new tenant **cannot** gate production traffic until someone explicitly opts in. Every record separates `decided_action` from `enforced` and `mode`.

## The audit record

Every decision writes exactly **one** record, sufficient to reproduce the decision offline: policy id/version/checksum, full signal snapshot, every rule evaluated (matched/won/errored + fail mode applied), the winner and why it won, `decided_action`, `enforced`, `mode`, any fail-safe fired, and an explicit engine-error marker when applicable. Records are written through the platform audit-trail service (hash-chained, de-duplicated — see *Audit Trail Integrity*).

## Dry-run / simulate

`simulate()` returns the decision the engine *would* make for a signal snapshot + policy version, **without enforcing or writing audit records** — used for policy testing and validating new versions against historical cases.

## Performance

Pure arithmetic over already-computed signals — no AI calls, no network. Sub-millisecond typical decision. Policies are parsed, validated, and fingerprinted once, then cached.

## Storage & tenancy decisions (locked)

- Policy storage lives in the **connectors database** (`policy_documents`, `policy_active_bindings`) — not auth, not a new core DB.
- Tenant = `user_id` (no separate org/tenant table exists).
- Per-tenant enforcement mode is resolved via a **cached connectors lookup** kept out of the sub-ms evaluation path; lookup failure fails safe to `shadow`.
- Default enforcement mode for every tenant: `shadow`.

## Plain-language guarantees (summary)

1. Decisions come from **your** versioned, immutable rules — not the model's opinion.
2. Identical inputs + identical policy version → **identical decision, forever**.
3. Rules **cannot execute code** — sandboxed, allowlisted condition language.
4. A missing high/critical signal **fails closed**; a skipped check is never a pass.
5. No matching rule → your declared default — **never a silent allow**.
6. **Shadow by default** — enforcement is opt-in.
7. Every decision is recorded with enough detail to reproduce and defend it; the record never overstates what was enforced.
