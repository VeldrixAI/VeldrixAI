class VeldrixError(Exception):
    """Base VeldrixAI SDK error."""


class VeldrixAuthError(VeldrixError):
    """Invalid or missing API key."""


class VeldrixAPIError(VeldrixError):
    """VeldrixAI API returned an unexpected error."""
    def __init__(self, message: str, status_code: int = None):
        super().__init__(message)
        self.status_code = status_code


class VeldrixTimeoutError(VeldrixError):
    """VeldrixAI API did not respond within the configured timeout."""


class VeldrixBlockError(VeldrixError):
    """
    Raised when GuardConfig.block_on_verdict is set and the verdict matches.
    Catch this to implement custom block handling:

        try:
            response = chat(messages)
        except VeldrixBlockError as e:
            return "I can't help with that."
    """


class VeldrixRateLimitError(VeldrixError):
    """
    Raised in sync mode (background=False) when the dispatch queue is full and
    queue_overflow_policy='raise'. Background mode never raises this — it drops
    and increments sdk.stats()['queue_dropped_total'] instead.

    Usage::

        from veldrixai import VeldrixRateLimitError
        try:
            response = chat(messages)
        except VeldrixRateLimitError:
            # shed load — queue is saturated
            return cached_response
    """


class VeldrixServiceUnavailableError(VeldrixError):
    """
    Raised in sync mode (background=False) when the client-side circuit breaker
    is OPEN (too many consecutive backend failures). Background mode silently
    drops the request and increments sdk.stats()['breaker_dropped_total'].

    The breaker resets after client_breaker_recovery_seconds.

    Usage::

        from veldrixai import VeldrixServiceUnavailableError
        try:
            response = chat(messages)
        except VeldrixServiceUnavailableError:
            # backend degraded — pass through without trust evaluation
            return llm_response
    """


class VeldrixConfigError(VeldrixError):
    """
    Raised when GuardConfig contains a combination of settings that can never
    work correctly — e.g. block_on_verdict set while background=True.

    This is a hard error at configuration time, not at call time, so developers
    catch it immediately during startup rather than silently getting wrong
    behaviour in production.

    Usage::

        from veldrixai import VeldrixConfigError
        try:
            config = GuardConfig(background=True, block_on_verdict=["BLOCK"])
        except VeldrixConfigError as e:
            print(e)  # clear message explaining the fix
    """
