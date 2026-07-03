# VeldrixAI — Platform Overview

> **Page status:** Current · **Last updated:** 2026-07-03 · **Audience:** Everyone (engineering, product, compliance, sales engineering)

## What VeldrixAI is

VeldrixAI is an **AI governance platform**. Customers send us the prompt/response pairs their AI systems produce; we evaluate every response across **five trust pillars**, compute a composite trust score, apply the customer's own **policy rules** to decide an enforcement outcome, and record every decision in a **tamper-evident audit trail** that can be defended to an auditor years later.

The two properties we sell on:

1. **Quality of judgement** — each pillar is served by its own purpose-aligned frontier model (up to 550B/675B parameters), not one generic model.
2. **Determinism** — identical inputs produce identical routing, identical model selection, identical sampling parameters, and (for the Policy Engine) *bit-identical decisions*. Governance verdicts are reproducible, which is what makes them auditable.

## The five trust pillars

| # | Pillar | Question it answers | Composite weight |
|---|--------|--------------------|------------------|
| 1 | **Content Risk** (safety/toxicity) | Is the output harmful, hateful, or dangerous? | 25% |
| 2 | **Hallucination & Factual Integrity** | Is the output grounded, or fabricated? | 20% |
| 3 | **Bias & Ethics** | Does the output stereotype or discriminate? | 15% |
| 4 | **Policy Violation & Prompt Security** | Does it violate business policy? Was the prompt an injection attack? | 30% |
| 5 | **Legal Exposure & Compliance** | Does it create regulatory or legal risk? | 10% |

Composite trust score = `1.0 − weighted_average(pillar risk scores)`, in `[0.0, 1.0]` where 1.0 = fully trusted.

## Service map

| Service | Port | Responsibility |
|---|---|---|
| **Auth** | 8000 | Registration/login (JWT), API keys (`vx-live-…`), Stripe billing, AES-256 secrets vault |
| **Core** | 8001 | Trust evaluation (five pillars), inference routing, Policy Engine, WebSocket/SSE realtime |
| **Connectors** | 8002 | Analytics, PDF reports, prompt library, audit trail (hash chain), model registry |
| **Frontend** | 5000 | Next.js 16 dashboard |
| **Traefik** | 80/443 | API gateway: TLS termination, rate limiting, path-based routing |
| **PostgreSQL** | 5432 | Users, API keys, reports, audit_trails, policy documents |
| **Redis** | 6379 | Sessions/JWT blacklist, cache + circuit-breaker state, async queues |
| **Prometheus / Grafana** | 9090 / 3001 | Metrics and dashboards |

## Current delivery state (as of 2026-07-03)

| Capability | Status |
|---|---|
| Five-pillar trust evaluation | **Live in production** |
| Multi-provider inference routing (NIM → Groq → Bedrock → OSS) | **Live** |
| Heavyweight per-pillar model matrix + deterministic inference | **Built, on dev branch** (`phase6-engine-integration-dev`) |
| Policy Engine (Phase 1: deterministic decisions) | **Built**; decision-only, shadow default |
| Audit hash chain + append-only enforcement (Phase 2A) | **Built** |
| Policy Engine production runtime + metrics + rollout API (Phase 2B) | **Built**; engine non-actuated |
| Local free dev mirror (Phase 5) | **Built** (`docker-compose.dev.yml`, WSL2) |
| Shadow integration of engine on live `/trust/evaluate` (Phase 6) | **Built in dev**, kill-switched OFF by default, awaiting operator ramp |
| Enforcement actuation (mask/rewrite/regenerate applied to responses) | **Not built** — future phase |

## Documentation set (this space)

| Page | Covers |
|---|---|
| VeldrixAI — System Architecture | Services, gateway, data stores, security layers, endpoints |
| VeldrixAI — Trust Engine & Five Pillars Specification | Pillar-by-pillar evaluation logic, scoring, fast paths, failure behavior |
| VeldrixAI — Model Matrix & Deterministic Inference | Which model serves each pillar, providers, routing, determinism contract |
| VeldrixAI — Policy Engine Specification | Rules, condition language, precedence, fail-safe, enforcement modes |
| VeldrixAI — Audit Trail Integrity | Hash chain, append-only trigger, verification |
| VeldrixAI — Policy Engine Operations & Rollout | Degradation, metrics, shadow→enforce playbook |
| VeldrixAI — Phase 6 Shadow Integration | Out-of-band engine tap on live traffic, kill switches, impact guard |
| VeldrixAI — Deployment & Environments | Production stack, local dev mirror, CI/CD gates |
| VeldrixAI — Configuration Reference | Every operational environment variable |
