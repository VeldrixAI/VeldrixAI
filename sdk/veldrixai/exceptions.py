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
