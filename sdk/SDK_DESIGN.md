# AegisAI Python SDK — Technical Design Document

**KAN-18 | SDK Design & Contract Definition**
Audience: Senior engineers, product architects, future SDK contributors

---

## 1. Public Design Philosophy

The SDK is designed around three principles:

**Minimal surface, maximum clarity.**
A developer should be able to integrate AegisAI in under five minutes. The public API exposes one entry point (`AegisAIClient`), one method per capability (`client.trust.evaluate`), and one typed result object. Nothing is hidden that needs to be visible; nothing is exposed that doesn't need to be.

**Errors are first-class citizens.**
Every failure mode the platform can produce has a named exception. Developers write `except AuthenticationError` — not `except Exception` with status-code inspection. This is non-negotiable for enterprise adoption.

**Structure over cleverness.**
The SDK is layered: config → auth → transport → service → types. Each layer has one responsibility. Future contributors can extend any layer without touching the others.

---

## 2. Package Structure

```
aegisai_sdk/
  __init__.py          # Public API surface — everything exported here
  client.py            # AegisAIClient — single entry point
  config.py            # AegisAIConfig — validated, immutable configuration
  http.py              # HttpClient — transport abstraction
  exceptions.py        # Full exception hierarchy
  types/
    trust.py           # TrustEvaluateRequest / TrustEvaluateResponse
  services/
    trust.py           # TrustService — wraps /trust/evaluate
  utils/
    validation.py      # Client-side input guards
examples/
  basic_usage.py
pyproject.toml
README.md
```

---

## 3. Authentication Abstraction Strategy

Authentication is resolved at configuration time, not at request time.

`AegisAIConfig.__post_init__` enforces that at least one credential (`api_key` or `token`) is present. If neither is provided, a `ConfigurationError` is raised before any network call is made — fail fast, fail clearly.

The `auth_headers` property on `AegisAIConfig` returns the correct header dict:

| Credential | Header injected |
|---|---|
| `api_key` | `X-API-Key: <key>` |
| `token` | `Authorization: Bearer <token>` |

`HttpClient` merges these headers into every request at construction time. Service methods never touch auth — they only call `self._http.post(...)`. This means auth strategy can be changed (e.g. rotating keys, OAuth2 token refresh) entirely within `config.py` and `http.py` without touching any service.

**Why API key first?**
API keys are stateless, long-lived, and appropriate for server-to-server integration — the primary SDK use case. JWT tokens are session-scoped and suited for dashboard flows. The SDK supports both but defaults to API key semantics.

---

## 4. Trust API Method Contract

### Input

`client.trust.evaluate()` accepts keyword arguments that map directly to `TrustEvaluateRequest`:

| Field | Type | Required | Description |
|---|---|---|---|
| `prompt` | `str` | ✅ | User prompt sent to the AI model |
| `response` | `str` | ✅ | AI-generated response to evaluate |
| `model` | `str` | ✅ | Model identifier, e.g. `gpt-4` |
| `provider` | `str` | ❌ | Provider name, e.g. `openai` |
| `context` | `dict` | ❌ | Evaluation context key/value pairs |
| `metadata` | `dict` | ❌ | Caller metadata (trace IDs, tags) |

Client-side validation (`require_non_empty`) runs before the HTTP call. This catches blank strings immediately without a round-trip.

### Output

`TrustEvaluateResponse` is a typed dataclass:

| Field | Type | Description |
|---|---|---|
| `report_id` | `str` | Unique evaluation identifier |
| `overall_score` | `float` | Aggregated safety score (0–100) |
| `confidence` | `float` | Score confidence (0–1) |
| `risk_level` | `str \| None` | `low`, `medium`, `high`, `critical` |
| `pillar_results` | `dict[str, PillarResult]` | Per-pillar breakdown |
| `created_at` | `datetime` | Evaluation timestamp |
| `execution_time_ms` | `float \| None` | Server-side execution time |

`TrustEvaluateResponse.from_api()` is the single deserialisation boundary. Raw API dicts never leak into application code.

---

## 5. Error Handling Model

```
AegisAIError                  ← catch-all base
├── ConfigurationError        ← bad client setup (no key, empty URL)
├── AuthenticationError       ← 401 — invalid/expired credentials
├── ValidationError           ← 422 — server rejected the payload
│     .errors: list           ← structured field-level errors
├── ApiResponseError          ← any other non-2xx
│     .status_code: int
│     .body: dict
├── ApiConnectionError        ← network failure, DNS error
└── TimeoutError              ← request exceeded configured timeout
```

**Design decisions:**

- All exceptions inherit from `AegisAIError` so a single `except AegisAIError` catches everything if the caller wants a safety net.
- `AuthenticationError` and `ValidationError` carry `status_code` for logging/observability.
- `ValidationError.errors` preserves the server's structured error list so callers can surface field-level feedback.
- `ApiConnectionError` and `TimeoutError` wrap `httpx` internals — the caller never needs to import `httpx`.

---

## 6. HTTP Transport Design

`HttpClient` is an internal class (not exported). It owns:

- Base header construction (auth + content-type)
- `httpx.Client` lifecycle (one client per request — stateless, thread-safe)
- Response normalisation via `_handle_response`
- Exception mapping from HTTP status codes to SDK exceptions

**Why httpx over requests?**
`httpx` has a near-identical sync API to `requests` but ships with a native async client (`httpx.AsyncClient`). When an async SDK variant is needed, `HttpClient` can be mirrored as `AsyncHttpClient` with `async def _request(...)` and `await client.request(...)` — zero changes to service or client layers.

**Retry readiness:**
`_request()` is the single call site for all HTTP operations. Adding retry logic (exponential backoff, jitter) means wrapping this one method — no service code changes required.

---

## 7. Extensibility Strategy

New platform capabilities map to new service classes under `aegisai_sdk/services/`. Adding `client.reports` requires:

1. Create `aegisai_sdk/services/reports.py` with a `ReportsService` class
2. Add `self.reports = ReportsService(http)` to `AegisAIClient.__init__`
3. Add request/response types to `aegisai_sdk/types/`
4. Export from `aegisai_sdk/__init__.py`

The `AegisAIClient` constructor signature does not change. Existing integrations are unaffected.

Planned future namespaces:

| Namespace | Capability |
|---|---|
| `client.reports.list()` | List generated trust reports |
| `client.reports.get(id)` | Fetch a specific report |
| `client.reports.delete(id)` | Soft-delete a report |
| `client.policy.generate()` | AI governance policy generation |
| `client.trust.evaluate_batch()` | Batch evaluation (future) |

---

## 8. Why This Structure Supports Long-Term Platform Growth

**Single import, stable contract.**
`from aegisai_sdk import AegisAIClient` is the only import developers need. The internal module structure can be refactored freely without breaking the public API.

**Typed throughout.**
Dataclasses with type hints enable IDE autocompletion, mypy static analysis, and self-documenting code. No `dict["key"]` access in application code.

**Zero framework coupling.**
The SDK has one runtime dependency: `httpx`. It works in Django, FastAPI, Flask, Lambda, scripts, and notebooks without conflict.

**Versioned and distributable.**
`pyproject.toml` is configured for PyPI distribution. Semantic versioning + changelog discipline means enterprise customers can pin SDK versions with confidence.

**Testable by design.**
`HttpClient` is injected into services. Tests can substitute a mock HTTP client without patching global state. `pytest-httpx` enables full request/response simulation without a live server.
