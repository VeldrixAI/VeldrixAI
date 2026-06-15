# VeldrixAI Policy Engine

*An enterprise-grade, auditable explanation of how VeldrixAI turns AI-safety signals
into enforcement decisions. Written to be read by a compliance officer, not only an
engineer.*

---

## 1. Why this exists

VeldrixAI's five trust pillars (content safety, hallucination, bias, prompt security,
legal/compliance) produce **signals** — scores and flags about a piece of AI output.
Historically, the *decision* about what to do with those signals (allow it? block it?
send it for human review?) was made by numbers hard-coded deep in the software. That
is not defensible to an auditor: nobody could point to a rule and say *"this is the
rule we applied, this is who wrote it, this is the version, and here is proof it ran."*

The **Policy Engine** fixes that. It moves the accountable decision **off the model's
opinion and onto a rule that you — the customer — authored, versioned, and can show an
auditor.** The engine:

- **consumes** the pillar signals as inputs (it never re-judges the content),
- **decides** the enforcement outcome using your explicit rules,
- **records** a complete, immutable account of every decision,
- and **fails safe** — when something is missing or breaks, it never silently lets a
  high-risk decision pass.

The single most important property: **the same inputs and the same policy version
always produce the exact same decision — today, next year, and during an audit five
years from now.**

---

## 2. The vocabulary

### 2.1 The seven enforcement actions

Every rule resolves to exactly one of these outcomes:

| Action | Meaning |
|---|---|
| `allow` | Permit the output as-is. |
| `disclaimer` | Permit, but attach a disclaimer. |
| `mask` | Permit with sensitive parts redacted. |
| `rewrite` | Replace the output with a safer rewording. |
| `regenerate` | Discard and ask the model to try again. |
| `escalate` | Route to a human for review. |
| `block` | Stop the output from being used. |

These are ordered from least to most restrictive. When two rules tie, the **more
restrictive** action wins (see §5).

> **Current scope note.** In this release, `block` and `escalate` are the actions that
> can actually *gate* live traffic. The other four (`mask`, `rewrite`, `regenerate`,
> `disclaimer`) are fully **decided and recorded**, but applying them requires a
> response-rewriting step that is a later phase. Until then, a decision of, say,
> `mask` is recorded with `enforced = false` — we never claim an enforcement that did
> not actually happen.

### 2.2 Severity

Each rule carries a severity: `low`, `medium`, `high`, or `critical`. Severity is the
**first** thing that decides which rule wins a conflict, and it controls the default
fail-safe behavior (§6).

### 2.3 The signal context — what a rule can look at

A rule's condition can reference these (and only these) typed fields:

| Field family | Example fields | Meaning |
|---|---|---|
| Pillar score | `safety_score`, `bias_score`, `hallucination_score`, `prompt_security_score`, `compliance_score` | 0–100, **higher = safer**. |
| Pillar risk | `safety_risk`, `bias_risk`, … | 0–1, **higher = riskier**. |
| Pillar evaluated | `safety_evaluated`, `bias_evaluated`, … | `true`/`false` — did the pillar actually assess this dimension? |
| Composite | `composite_score` | 0–1 overall trust score. |
| Request metadata | `region`, `action_class`, `data_categories`, `blast_radius` | Context about the request itself. |

Any other name is rejected when the policy is loaded (§7), so a typo can never silently
become a rule that does nothing.

---

## 3. What a policy looks like

A **policy** is data, not code. It is a versioned document containing an ordered list
of **rules**, plus a `default_action` used when no rule matches.

A **rule** has:

- `id` — a stable name an auditor can refer to.
- `description` — plain-language explanation.
- `condition` — a true/false test over the signal context (grammar in §4).
- `action` — one of the seven actions.
- `severity` — low / medium / high / critical.
- `priority` — an optional number to break ties you care about.
- `fail_mode` — what to do if the condition can't be evaluated (§6).

Illustrative rule, in words: *"If the content-safety score is below 40, block it; this
is critical."* The engine stores that as a condition `safety_score < 40`, action
`block`, severity `critical`.

### Versioning and immutability

- A policy carries a `version` number and a `checksum` (a cryptographic fingerprint of
  its rules).
- **An effective policy can never be changed in place.** Any attempt to modify it is
  refused by the software. To change a policy you create a **new version**; the old
  version remains a permanent, addressable artifact.
- This is the enterprise change-control guarantee: every decision is tied to an exact
  policy version + checksum, and that version's rules can never be rewritten after the
  fact.

---

## 4. The condition language (grammar)

Conditions are deliberately tiny and safe. They **cannot run code** — there is no way
to call a function, read a file, reach the internet, or access anything beyond the
declared signal fields. This is enforced by an allowlist: anything not explicitly
permitted is rejected when the policy is loaded.

**Permitted:**

- Comparisons: `==`, `!=`, `<`, `<=`, `>`, `>=`
- Membership: `in`, `not in` (e.g. `region in ['EU', 'UK']`, `'pii' in data_categories`)
- Boolean logic: `and`, `or`, `not`
- Values: the declared signal fields, plus literal numbers, text, `True`, `False`,
  `None`, and simple lists of literals.

**Forbidden (and rejected at load time):** function calls, attribute access (e.g.
`x.__class__`), indexing (`x[0]`), arithmetic (`+`, `-`, `*`), and any unknown name.

**Examples:**

| Intent | Condition |
|---|---|
| Block clearly unsafe content | `safety_score < 40` |
| Escalate when bias wasn't assessed | `bias_evaluated == False` |
| Mask PII in regulated regions | `region in ['EU', 'UK'] and 'pii' in data_categories` |
| Disclaimer on shaky legal claims | `compliance_score < 70 or hallucination_risk > 0.5` |

---

## 5. How conflicts are resolved (precedence)

Often several rules match the same request. The engine picks **one** winner using a
strict, deterministic order. It tries each level in turn and stops at the first one
that separates the candidates:

1. **Severity** — `critical` beats `high` beats `medium` beats `low`.
2. **Restrictiveness** — at equal severity, the more restrictive action wins:
   `block` > `escalate` > `regenerate` > `rewrite` > `mask` > `disclaimer` > `allow`.
3. **Priority** — at equal severity and restrictiveness, the higher `priority` number
   wins (your explicit override).
4. **Document order** — if still tied, the rule that appears earlier in the policy
   wins.

This order is fixed and reproducible. The audit record names the winning rule **and
states which of these four levels decided it**, in plain language — for example:
*"Rule 'pii_mask' won on SEVERITY: critical outranks medium (rule 'eu_disclaimer')."*

Every rule that matched (not just the winner) is recorded, so an auditor can see the
full picture, including why the runners-up did not prevail.

---

## 6. Fail-safe behavior

The engine is built to **fail closed** for serious decisions — a problem must never
result in a silently permitted high-risk output.

### A required signal is missing
Sometimes a pillar didn't produce a score (an AI judge timed out, a safety check was
skipped). If a rule needs that missing signal:

- A `fail_closed` rule is treated as **firing with a worst-case action** — `block` for
  critical, `escalate` otherwise. A missing critical signal can never read as "safe."
- A `fail_open` rule is treated as **not firing**, but the fact that it errored is
  still recorded — never silently dropped.
- **Default:** rules at `high` or `critical` severity fail **closed** unless you
  explicitly choose otherwise.

### A skipped evaluation is never a pass
One pillar has a fast shortcut that assigns a high score (92) when no demographic terms
are present, *without actually assessing bias*. The engine treats that as
**`bias_evaluated = false` with no score** — the 92 is suppressed and can never be read
as a passing bias score. If you want to act on "bias wasn't assessed," you write a rule
on `bias_evaluated == False`.

### No rule matched
The engine returns the policy's declared `default_action`. For regulated tenants this
should be `escalate` or `block` — **never** an implicit allow.

### The engine itself errors
If something breaks inside the engine, it fails closed to `block` (treated as
critical), and writes a record explicitly marked as an engine error. It never returns a
silent allow.

---

## 7. Validation happens early

Policies are checked **when they are loaded**, not when a request arrives. A condition
that references an unknown field, uses forbidden syntax, or is otherwise malformed
causes the policy load to fail loudly. This means a broken rule is caught by your change
process — it can never quietly turn into a rule that does nothing in production.

---

## 8. Enforcement mode (shadow by default)

Whether a decision actually *gates* live traffic is controlled per tenant by an
**enforcement mode**. Critically, **the engine always evaluates, resolves, and records
a decision regardless of mode** — the mode only governs whether that decision is acted
upon.

| Mode | What happens |
|---|---|
| `shadow` *(default for every tenant)* | The engine decides and records, but **nothing is gated**. You can watch exactly what *would* happen before turning enforcement on. |
| `enforce` | `block` / `escalate` decisions gate traffic. |
| `enforce_critical_only` | Only `critical` `block`/`escalate` decisions gate; everything else is shadowed (decided + recorded, not gated). |

**A brand-new tenant starts in `shadow` and therefore cannot gate production traffic
until someone explicitly turns enforcement on.** This is a deliberate safety default:
enforcement is opt-in.

Every decision record clearly separates **what was decided** (`decided_action`) from
**whether it was enforced** (`enforced`) and **under which mode** (`mode`). The record
never implies an enforcement that did not occur, and never implies a no-op when a
critical decision was in fact gated.

---

## 9. The audit record

Every decision writes **exactly one** record to the audit trail. It contains
everything needed to **reproduce the decision offline** — feed the same signal snapshot
into the same policy version and you get the identical outcome:

- The policy `id`, `version`, and `checksum` (proof of exactly which rules ran).
- The full **signal snapshot** (the exact inputs at decision time).
- **Every rule that was evaluated** — which matched, which won, and any that errored
  (with the fail-mode applied).
- The **winning rule** and a plain-language reason it won.
- The final `decided_action`, whether it was `enforced`, the `mode`, and any fail-safe
  that fired.
- An explicit marker if the decision came from an engine error.

The Policy Engine does **not** run its own audit database. It writes through the
platform's existing audit-trail service, and that service de-duplicates retries so a
decision can never be double-recorded.

---

## 10. Testing your policies safely (dry-run)

The engine offers a **simulate / dry-run** capability: given a signal snapshot and a
policy version, it returns the decision it *would* make **without enforcing anything
and without writing to the audit trail**. This powers the policy-testing experience and
lets you validate a new policy version against historical cases before it goes live.

---

## 11. Performance

Policy evaluation is pure arithmetic over signals that were already computed — no AI
calls, no network. A typical policy decides in well under a millisecond. Policies are
parsed and fingerprinted once and cached, so the live decision path only walks the
pre-validated rules.

---

## 12. Plain-language guarantees (summary)

1. Decisions come from **your** versioned, immutable rules — not the model's opinion.
2. Identical inputs + identical policy version → **identical decision, forever.**
3. Rules **cannot execute code** — the condition language is sandboxed and allowlisted.
4. A missing high/critical signal **fails closed**; a skipped check is never a pass.
5. No matching rule returns your declared default — **never a silent allow**.
6. **Shadow by default**: a new tenant gates nothing until you opt in.
7. Every decision is recorded with enough detail to **reproduce and defend it** to an
   auditor, and the record never overstates what was enforced.
