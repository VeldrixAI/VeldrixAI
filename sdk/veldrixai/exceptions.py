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
    """


class VeldrixServiceUnavailableError(VeldrixError):
    """
    Raised in sync mode (background=False) when the client-side circuit breaker
    is OPEN (too many consecutive backend failures). Background mode silently
    drops the request and increments sdk.stats()['breaker_dropped_total'].

    The breaker resets after client_breaker_recovery_seconds.
    """
