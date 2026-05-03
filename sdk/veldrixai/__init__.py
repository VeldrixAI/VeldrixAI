"""
VeldrixAI Python SDK
Runtime trust infrastructure for AI applications.

Quickstart:
    from veldrixai import Veldrix

    veldrix = Veldrix(api_key="vx-live-...")

    @veldrix.guard
    def chat(messages):
        return openai_client.chat.completions.create(...)

    response = chat(messages)
    print(response.content)          # original LLM text
    print(response.trust.verdict)    # ALLOW | WARN | REVIEW | BLOCK
    print(response.trust.overall)    # 0.0 – 1.0

Sync manual evaluation:
    trust = veldrix.evaluate_sync(prompt="...", response="...")
    print(trust.verdict)

Global HTTP intercept (zero code changes to LLM calls):
    from veldrixai.http_interceptor import enable_global_intercept
    veldrix = Veldrix(api_key="vx-live-...")
    enable_global_intercept(veldrix)

ASGI/WSGI middleware:
    from veldrixai.middleware import VeldrixMiddleware
    app.add_middleware(VeldrixMiddleware, api_key="vx-live-...")

Flask:
    from veldrixai.middleware import init_flask
    init_flask(app, api_key="vx-live-...")
"""

from veldrixai.client    import Veldrix
from veldrixai.models    import (
    GuardedResponse,
    TrustResult,
    PillarScore,
    GuardConfig,
)
from veldrixai.streaming import GuardedStream
from veldrixai.exceptions import (
    VeldrixError,
    VeldrixAuthError,
    VeldrixTimeoutError,
    VeldrixAPIError,
    VeldrixBlockError,
    VeldrixRateLimitError,
    VeldrixServiceUnavailableError,
    VeldrixConfigError,
)
from veldrixai.http_interceptor import (
    enable_global_intercept,
    disable_global_intercept,
)
from veldrixai.middleware import VeldrixMiddleware, init_flask
from veldrixai.providers  import match_provider, is_ai_endpoint, register_provider, unregister_provider

try:
    from importlib.metadata import version as _pkg_version
    __version__ = _pkg_version("veldrixai")
except Exception:
    __version__ = "1.0.0"

__all__ = [
    # Core client
    "Veldrix",
    # Models
    "GuardedResponse",
    "TrustResult",
    "PillarScore",
    "GuardConfig",
    "GuardedStream",
    # Exceptions
    "VeldrixError",
    "VeldrixAuthError",
    "VeldrixTimeoutError",
    "VeldrixAPIError",
    "VeldrixBlockError",
    "VeldrixRateLimitError",
    "VeldrixServiceUnavailableError",
    "VeldrixConfigError",
    # Global HTTP intercept
    "enable_global_intercept",
    "disable_global_intercept",
    # ASGI/WSGI middleware
    "VeldrixMiddleware",
    "init_flask",
    # Provider registry
    "match_provider",
    "is_ai_endpoint",
    "register_provider",
    "unregister_provider",
    # Version
    "__version__",
]
