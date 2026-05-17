# Changelog

All notable changes to the VeldrixAI Python SDK will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1] - 2025-01-15

### Fixed
- `DEFAULT_BASE_URL` now correctly points to `https://api.veldrixai.ca` (was `api.veldrix.ai`)
- All error message URLs updated to `app.veldrixai.ca`
- `VeldrixMiddleware` no longer duplicates `DEFAULT_BASE_URL`; imports from `transport.py`
- `_dispatch_in_thread` now propagates the full client config (metadata, timeout_ms) instead of constructing a bare `GuardConfig` — fixes silent metadata drop on sync intercepted calls
- `PROVIDER_REGISTRY` mutations (`register_provider`, `unregister_provider`) are now guarded by a `threading.Lock`; `match_provider` takes a snapshot under lock — safe for multi-threaded WSGI apps
- `GuardedStream._fire_async` background mode now writes the trust result back to `self._trust` via a wrapper coroutine — `stream.trust` is no longer permanently `PENDING` after async background stream evaluation
- `ClientCircuitBreaker._effective_state` renamed to `_check_and_transition` to make the state-mutating nature explicit and eliminate the maintenance trap

## [1.0.0] - 2026-01-15

### Added
- `Veldrix` client with `@veldrix.guard` decorator for sync and async LLM calls
- `evaluate()` async and `evaluate_sync()` sync manual evaluation methods
- `GuardedResponse` transparent proxy — preserves all original LLM response attributes
- `TrustResult` with five-pillar breakdown: safety, hallucination, bias, prompt_security, compliance
- `GuardConfig` for per-guard configuration (block_on_verdict, background mode, custom handlers)
- `GuardedStream` for streaming LLM response evaluation
- `VeldrixMiddleware` ASGI middleware for FastAPI / Starlette
- `init_flask()` hook for Flask applications
- `enable_global_intercept()` zero-code HTTP interception for all AI providers
- 14 provider adapters: OpenAI, Anthropic, Google Gemini, AWS Bedrock, Cohere, Mistral, DeepSeek, Hugging Face, LlamaIndex, Ollama, Qwen, LangChain, LiteLLM, Generic
- 30+ AI endpoint patterns in provider registry (US, EU, APAC, China)
- Automatic retry with exponential backoff on 429/503
- Graceful degradation — transport errors never crash the developer's application
- `py.typed` marker for PEP 561 type checking support
- Optional dependency extras: `pip install veldrixai[openai]`, `veldrixai[all]`, etc.
- 4 test suites: transport, guard decorator, adapter extraction, HTTP interceptor
- 8 quickstart examples covering OpenAI, Anthropic, LangChain, LiteLLM, async, ASGI, global intercept
