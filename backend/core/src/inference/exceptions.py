"""Inference routing exceptions."""

from datetime import datetime, timezone


class InferenceExhaustedError(Exception):
    """Raised when all configured inference providers have failed or are unavailable."""

    def __init__(self, pillar: str, providers_attempted: list[str]) -> None:
        self.pillar = pillar
        self.providers_attempted = providers_attempted
        self.timestamp = datetime.now(timezone.utc).isoformat()
        super().__init__(
            f"All inference providers exhausted for pillar={pillar!r}. "
            f"Attempted: {providers_attempted}"
        )
