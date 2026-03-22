# Changelog

All notable changes to VeldrixAI will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] — 2026-03-15

### Added
- **5-Pillar Trust Evaluation Engine** — concurrent async evaluation across Content Risk, Hallucination Risk, Bias & Ethics, Policy Violation, and Legal Exposure pillars.
- **NVIDIA NIM Integration** — all five pillars backed by NVIDIA NIM hosted inference endpoints, with exponential backoff retry and graceful degraded fallback.
- **Composite Trust Score** — weighted aggregate across all pillar scores, returned in evaluation response metadata.
- **Universal Python SDK** (`veldrixai`) — typed client with synchronous and async support, LangChain adapter, LiteLLM adapter, and OpenAI adapter.
- **Authentication Service** — JWT-based auth with Stripe billing integration (Grow and Scale tiers).
- **Connectors Service** — analytics, PDF report generation with NIM-powered narrative summaries, and S3 export.
- **VeldrixAI Dashboard** — Next.js App Router frontend with dark theme (void background, violet accent), real-time trust score charts, and grouped navigation.
- **Docker Compose** — single-command local development stack with PostgreSQL, all three backend services, and the frontend.
- **GitHub Actions CI** — automated test, lint, and SDK publish workflows.

### Changed
- Repository restructured from flat `aegisai-*` directories to `backend/`, `frontend/`, `sdk/` layout.
- All `AEGIS_*` environment variables renamed to `VELDRIX_*` for brand consistency.

---

## [Unreleased]

- Public API documentation site
- Webhook event system for real-time trust alerts
- Multi-region NIM endpoint routing
