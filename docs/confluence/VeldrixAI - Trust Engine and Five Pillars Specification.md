# VeldrixAI — Trust Engine & Five Pillars Specification

> **Page status:** Current · **Last updated:** 2026-07-03 · **Audience:** Engineering, solutions engineering
> **Source of truth:** `backend/core/src/pillars/implementations/ai_safety_pillars.py`

## Execution model

For every trust evaluation (`POST /api/v1/evaluate` → `evaluate_trust`):

1. All **five pillars run concurrently** (`asyncio.gather`) against the `(prompt, response)` pair.
2. Each pillar may take a **regex fast path** (< 2 ms, no model call) where applicable.
3. Otherwise the pillar calls its designated model through the single inference service `_pillar_inference()`, which forwards the pillar's full model contract (model map, temperature, top_p, seed, max_tokens, timeout) and retries once with the pillar's **fallback model** if every provider is exhausted on the primary.
4. Scores are normalized to **0–100, higher = safer**, with a typed `PillarResult` (status, score, confidence, risk level, flags, details).
5. A pillar **never raises**: any failure returns a *degraded* result (`score=50`, `confidence=0.3`, status `PARTIAL`) so the platform always answers.
6. A composite trust score is computed and (Phase 6) the Policy Engine shadow-evaluates the results after the response is sent.

### Input handling
- Inputs are truncated to `VELDRIX_MAX_INPUT_CHARS` (default 2000) using a **first-half + last-half** strategy so both intro and conclusion survive.
- Prompts are capped at 500 chars in pillar prompts.

### Risk-level mapping (all pillars)
| Condition | Risk level |
|---|---|
| score ≥ 80 and confidence ≥ 0.70 | `SAFE` |
| score ≥ 60 and confidence ≥ 0.60 | `REVIEW_REQUIRED` |
| score ≥ 40 | `HIGH_RISK` |
| otherwise | `CRITICAL` |

## Pillar specifications

### Pillar 1 — Content Risk (`safety_toxicity`, weight 0.25)
- **Fast path:** curated toxicity/threat regex on prompt or response → score 5.0, confidence 0.95, flag `explicit_content_detected`, no model call.
- **Model path:** Llama Guard (purpose-built safety classifier) receives the conversation in guard format and returns plain text: `safe` or `unsafe\nS1\nS2…` (violated taxonomy categories).
- **Scoring:** unsafe → risk 0.90 (score 10); safe → risk 0.05 (score 95). Violated categories become flags.

### Pillar 2 — Hallucination & Factual Integrity (`hallucination`, weight 0.20)
- **Model path only** (no fast path). System prompt requests strict JSON: `{hallucination_risk: 0–1, confidence: 0–1, uncertain_claims: [...], grounded: bool}`.
- **Scoring:** `score = (1 − hallucination_risk) × 100`; model-reported confidence is used directly. Flags: `hallucination_risk` (>0.3), `uncertain_claims_detected`, `response_not_grounded`.

### Pillar 3 — Bias & Ethics (`bias_fairness`, weight 0.15)
- **Fast path:** if the response contains **no demographic terms** (curated regex) → score 92.0, confidence 0.90, method `demographic_fast_path` (~60% of traffic). ⚠️ **Governance note:** this fast path did not actually assess bias — the Policy Engine deliberately surfaces it as `bias_evaluated=false` so the 92 can never read as a passing bias score.
- **Model path:** JSON verdict `{bias_score, bias_types, ethical_flags, severity}`.
- **Scoring:** `score = (1 − bias_score) × 100`, confidence 0.88. Flags: `bias_detected` (>0.3), each bias type, `ethical_concerns`.

### Pillar 4 — Policy Violation & Prompt Security (`prompt_security`, weight 0.30)
- **Fast path:** prompt-injection regex (instruction-override, DAN/roleplay, prompt-extraction patterns) on the prompt → score 0.0, confidence 0.98, flag `prompt_injection_detected`.
- **Model path:** the caller may supply `policy_context` in the request context (Policy Engine integration point); it is injected into the evaluation prompt. JSON verdict `{violation_detected, severity, violated_rules, recommendation}`.
- **Scoring (severity → score):** critical 5 · high 25 · medium 55 · low 78 · no violation 95. Flags capped at 5 rules to avoid bloat.

### Pillar 5 — Legal Exposure & Compliance (`compliance_policy`, weight 0.10)
- **Model path only.** JSON verdict `{legal_risk_score, exposure_types, jurisdictions_affected, requires_disclaimer}`.
- **Scoring:** `score = (1 − legal_risk_score) × 100`, confidence 0.87. Flags: `legal_risk_detected` (>0.3), `disclaimer_required`, exposure types (max 5).

## Composite trust score

Weights intentionally differ from pillar metadata weights to emphasize risk domains:

```
composite = 1.0 − Σ(weightᵢ × riskᵢ) / Σ(weightᵢ)
weights: prompt_security 0.30 · safety_toxicity 0.25 · hallucination 0.20
         · bias_fairness 0.15 · compliance_policy 0.10
```

Each pillar stores its raw model risk in `details.nim_risk_score`; when absent (degraded results) risk is derived as `1 − score/100`. No pillar data at all → neutral 0.5.

## Verdict parsing (robust JSON extraction)

Model output parsing (`_parse_nim_json`) handles, in order: `<think>…</think>` reasoning blocks (stripped), markdown code fences, plain JSON, and conversational prefixes (first `{` located). Total parse failure → degraded result with `parsing_error=true`.

## Decision trace (reproducibility record)

Every model-served pillar result records in `details`:

| Field | Meaning |
|---|---|
| `provider` | Which provider served the call (`nvidia_nim`, `groq`, …) |
| `model` | The exact model that produced the verdict |
| `fallback_model_used` | Whether the pillar's fallback model was used |
| `seed`, `temperature`, `top_p` | The pinned decoding parameters |
| `nim_risk_score` | Raw 0–1 risk consumed by the composite score |
| `method` | `nim_api`, `regex_fast_path`, or `demographic_fast_path` |

## Failure containment

| Failure | Result |
|---|---|
| All providers exhausted (primary model) | One retry with the pillar's fallback model |
| All providers exhausted (fallback too) | Degraded result (score 50, confidence 0.3, `PARTIAL`) |
| Malformed model output | Degraded result with `parsing_error=true` |
| Any unexpected exception | Caught in-pillar; degraded result — a pillar never crashes an evaluation |

## Latency posture

The heavyweight model matrix (see *Model Matrix & Deterministic Inference*) trades the historical sub-500 ms SLA for verdict quality. The per-pillar SLA logging threshold is `VELDRIX_PILLAR_LATENCY_SLA_MS` (default 10 000 ms). Regex fast paths remain < 5 ms and cover a large share of traffic (all of it for clean prompts on pillars 1/3/4's fast paths).
