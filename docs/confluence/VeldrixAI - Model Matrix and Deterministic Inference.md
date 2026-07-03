# VeldrixAI — Model Matrix & Deterministic Inference

> **Page status:** Current · **Last updated:** 2026-07-03 · **Audience:** Engineering, product
> **Source of truth:** `backend/core/src/config/pillar_models.py` (matrix) and `backend/core/src/inference/router.py` (routing)

## Design principles

1. **Distinct, purpose-aligned frontier model per pillar.** The five pillars are five different evaluation problems; a single shared model flattens them into one. Model *family* diversity (NVIDIA / Mistral / Meta) also reduces correlated blind spots across pillars.
2. **Deterministic decoding.** Every pillar call pins `temperature=0.0`, `top_p=1.0`, and a fixed `seed` (default 42). Identical inputs → identical sampling parameters, always.
3. **Provider-complete.** The matrix names a model for *every* provider, not just the primary — a failover to Groq/Bedrock/OSS no longer collapses all five pillars onto one generic model.

## The model matrix (defaults)

| Pillar | Primary (NVIDIA NIM) | Fallback (NIM) | Groq failover | Rationale |
|---|---|---|---|---|
| Content Risk | `meta/llama-guard-4-12b` | `meta/llama-guard-3-8b` | `meta-llama/llama-guard-4-12b` | Purpose-built safety classifier; its fixed taxonomy + verdict format is itself a determinism feature. **Never swap for a general chat model.** |
| Hallucination | `nvidia/nemotron-3-ultra-550b-a55b` | `nvidia/llama-3.1-nemotron-ultra-253b-v1` | `llama-3.3-70b-versatile` | Hardest reasoning task in the matrix → strongest reasoning model on the catalogue (550B MoE, 55B active, Mamba-Transformer hybrid, June 2026) |
| Bias & Ethics | `mistralai/mistral-large-3-675b-instruct-2512` | `mistralai/mistral-medium-3-5-128b` | `llama-3.3-70b-versatile` | 675B MoE (41B active); deliberately a different model family for perspective diversity |
| Prompt Security | `nvidia/llama-3.1-nemotron-ultra-253b-v1` | `nvidia/llama-3.3-nemotron-super-49b-v1.5` | `llama-3.3-70b-versatile` | 253B dense; holds long in-context business-policy rule sets reliably |
| Legal / Compliance | `meta/llama-3.1-405b-instruct` | `meta/llama-3.3-70b-instruct` | `llama-3.3-70b-versatile` | 405B dense; widest stable knowledge corpus (jurisdictions, regulation text) |

Per-pillar decoding defaults: `temperature 0.0` · `top_p 1.0` · `seed 42` · `max_tokens 1024` (safety: 128) · `timeout 25–30 s` (safety: 10 s).

Everything is overridable per pillar via environment (no code change):

```
VELDRIX_PILLAR_MODEL__{SAFETY|HALLUCINATION|BIAS|PROMPT_SECURITY|COMPLIANCE}__{FIELD}
FIELD ∈ PRIMARY | FALLBACK | GROQ | TEMPERATURE | TOP_P | SEED | MAX_TOKENS | TIMEOUT_SECONDS
```

> ⚠️ **Legacy env vars are dead by design.** The pre-2026 `VELDRIX_PILLAR_*_MODEL` variables are intentionally **not read**. Deployed env files still contain them pinned to 8B models; honoring them would silently downgrade four pillars. Delete them from live env files.

## Provider registry

Providers activate only when their credentials are present, and are walked in priority order:

| Priority | Provider | Activation env | Default model (when no map applies) | Timeout |
|---|---|---|---|---|
| 1 | NVIDIA NIM (`integrate.api.nvidia.com/v1`) | `NVIDIA_API_KEY` | `NVIDIA_MODEL_ID` | `NVIDIA_TIMEOUT_S` (4 s) |
| 2 | Groq | `GROQ_API_KEY` | `GROQ_MODEL_ID` (`llama-3.3-70b-versatile`) | `GROQ_TIMEOUT_S` (3 s) |
| 3 | AWS Bedrock (OpenAI-compatible proxy) | `BEDROCK_PROXY_URL` | `BEDROCK_MODEL_ID` | 10 s |
| 4 | OSS local (vLLM/Ollama, air-gapped) | `OSS_INFERENCE_URL` | `OSS_MODEL_ID` | 15 s |

Per-pillar request timeouts (10–30 s) override the provider client defaults — heavyweight primaries need more than the 4 s socket default.

## Deterministic routing

`route_inference()` is the single entry point for all pillar inference.

**Model resolution precedence (per provider):**
1. The pillar's per-provider model map (`provider_models[provider.name]`) — every provider serves the pillar's designated model.
2. `model_override` — NVIDIA NIM only (legacy call sites).
3. The provider's env-configured default model.

**Routing modes:**

| Mode | Behavior | When |
|---|---|---|
| **Deterministic** (default) | Strict priority walk: NIM → Groq → Bedrock → OSS, skipping providers whose circuit breaker is OPEN. Same request → same provider+model when the fleet is healthy. | `VELDRIX_DETERMINISTIC_ROUTING=true` (default) |
| **Speculative race** (opt-in) | Primary and first fallback are started simultaneously; first successful response wins, the loser is cancelled. Lower latency, but the serving provider becomes load-dependent (non-deterministic model selection). | `VELDRIX_DETERMINISTIC_ROUTING=false` **and** `VELDRIX_SPECULATIVE_EXECUTION=true` |

Both flags are read **at call time** — operators can flip them without a restart.

**Resilience within a provider:** transient errors (429/5xx/timeouts) retry with exponential backoff inside the provider's retry budget; credential errors (401/403) and non-retryable 4xx skip the provider without tripping the breaker; exhausted retries trip the per-provider **circuit breaker** (CLOSED/OPEN/HALF_OPEN; in-memory or Redis-backed for multi-replica). When every provider fails, `InferenceExhaustedError` triggers the pillar's **fallback model retry**, and only after that a degraded result.

## The determinism contract (what we claim, precisely)

| Layer | Guarantee |
|---|---|
| Model selection | Deterministic per pillar per provider — a function of configuration only, never of load |
| Provider selection | Deterministic priority order (default mode), varies only on provider *outage* (circuit breaker) |
| Decoding | temperature/top_p/seed pinned and sent on every request |
| Verdict → score | Pure arithmetic; identical verdict → identical score, flags, risk level |
| Policy decision | Bit-identical for identical signals + policy version (see Policy Engine spec) |
| Traceability | Every result records provider, model, seed, temperature, top_p, fallback flag |

**Honest caveat for customer conversations:** inference providers do not guarantee bit-exact reproducibility for large MoE serving (batching effects). Our claim is that we remove **every source of variance under our control** — selection, routing, sampling — and record the rest. The Policy Engine layer on top *is* bit-exact.

## Latency

| Model class | Typical NIM latency |
|---|---|
| Guard models (8–12B) | ~200 ms |
| 49–70B | ~300–400 ms |
| 253B dense / 550B MoE / 675B MoE | ~1.5 s |
| 405B dense | ~2.5 s |

Regex fast paths (< 5 ms) short-circuit a large share of traffic before any model call. The SLA logging threshold is `VELDRIX_PILLAR_LATENCY_SLA_MS` (default 10 s). Deployments that need the old sub-500 ms profile can pin smaller primaries per pillar via env.

## Where things live

| Concern | File |
|---|---|
| Model matrix + decoding config | `backend/core/src/config/pillar_models.py` |
| Provider registry | `backend/core/src/inference/providers.py` |
| Router (deterministic + speculative) | `backend/core/src/inference/router.py` |
| Circuit breakers | `backend/core/src/inference/circuit_breaker.py`, `circuit_breaker_redis.py` |
| Pillar inference service | `backend/core/src/pillars/implementations/ai_safety_pillars.py::_pillar_inference` |
| Matrix documentation (YAML mirror) | `backend/core/config/nvidia_models.yaml` |
| Tests | `backend/core/tests/test_pillar_determinism.py` (+ `test_nim_pillars.py`, `test_trust_evaluation.py`) |
