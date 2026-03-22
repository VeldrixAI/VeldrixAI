"""
VeldrixAI SDK — Public data models.
These are the types developers interact with.
"""

from __future__ import annotations
from typing import Any, Callable, Optional
from pydantic import BaseModel, Field


class PillarScore(BaseModel):
    """Score for a single trust pillar."""
    name:       str
    score:      Optional[float] = None     # 0.0 (worst) → 1.0 (best), None if errored
    flags:      list[str] = []
    latency_ms: Optional[int] = None
    error:      Optional[str] = None


class TrustResult(BaseModel):
    """
    The trust evaluation result attached to every guarded response.
    Accessible as response.trust
    """
    overall:        float                    # weighted aggregate 0.0–1.0
    verdict:        str                      # ALLOW | WARN | REVIEW | BLOCK | PENDING | UNKNOWN
    pillar_scores:  dict[str, float]         # {safety: 0.97, hallucination: 0.88, ...}
    pillars:        list[PillarScore] = []   # detailed per-pillar breakdown
    critical_flags: list[str] = []
    all_flags:      list[str] = []
    request_id:     str = ""
    latency_ms:     int = 0

    @property
    def passed(self) -> bool:
        """True when verdict is ALLOW. False for everything else including UNKNOWN."""
        return self.verdict == "ALLOW"

    @property
    def blocked(self) -> bool:
        """True only when verdict is explicitly BLOCK."""
        return self.verdict == "BLOCK"

    @property
    def needs_review(self) -> bool:
        """True when human review is recommended (WARN or REVIEW verdict)."""
        return self.verdict in ("WARN", "REVIEW")

    @property
    def is_degraded(self) -> bool:
        """
        True when evaluation failed silently (network error, timeout, API down).
        The LLM response was still returned to the developer — Veldrix just
        couldn't evaluate it.

        Usage:
            if response.trust.is_degraded:
                logger.warning("Trust evaluation unavailable for request %s",
                               response.trust.request_id or "unknown")
        """
        return self.verdict == "UNKNOWN" and self.overall == 0.0 and not self.request_id

    def __repr__(self):
        return (
            f"TrustResult(verdict={self.verdict!r}, "
            f"overall={self.overall:.2f}, "
            f"flags={self.critical_flags})"
        )


class GuardedResponse:
    """
    Transparent wrapper around any LLM response object.

    Preserves the full original response so existing code continues to work:
        response.content           → the LLM text
        response.trust             → TrustResult (VeldrixAI addition)
        response.choices[0]...     → original OpenAI-style attributes still work
        response.model             → still works

    The developer never needs to change their existing response-handling code.
    """

    __slots__ = ("_original", "trust")

    def __init__(self, original: Any, trust: TrustResult):
        object.__setattr__(self, "_original", original)
        object.__setattr__(self, "trust",     trust)

    # ── Transparent attribute passthrough ─────────────────────────────────────
    def __getattr__(self, name: str) -> Any:
        return getattr(object.__getattribute__(self, "_original"), name)

    def __setattr__(self, name: str, value: Any):
        if name in ("trust", "_original"):
            object.__setattr__(self, name, value)
        else:
            setattr(object.__getattribute__(self, "_original"), name, value)

    def __repr__(self):
        original = object.__getattribute__(self, "_original")
        trust    = object.__getattribute__(self, "trust")
        return f"GuardedResponse(trust={trust!r}, original_type={type(original).__name__})"

    def __str__(self):
        """str(response) returns the LLM text content."""
        return self.content

    # ── content property — works for OpenAI, LiteLLM, str ───────────────────
    @property
    def content(self) -> str:
        original = object.__getattribute__(self, "_original")
        return _extract_content(original)

    # ── Serialization support ────────────────────────────────────────────────
    def model_dump(self) -> dict:
        """
        Pydantic-compatible serialization. Returns the original response's
        dict representation merged with the trust result.
        Allows: return JSONResponse(response.model_dump())
        """
        original = object.__getattribute__(self, "_original")
        trust    = object.__getattribute__(self, "trust")

        base: dict = {}
        if hasattr(original, "model_dump"):
            base = original.model_dump()
        elif hasattr(original, "__dict__"):
            base = {k: v for k, v in original.__dict__.items()
                    if not k.startswith("_")}
        elif isinstance(original, dict):
            base = original.copy()
        elif isinstance(original, str):
            base = {"content": original}

        base["_veldrix_trust"] = trust.model_dump()
        return base

    def to_dict(self) -> dict:
        """Alias for model_dump(). For developers who prefer this style."""
        return self.model_dump()

    def __json__(self) -> dict:
        """Support for orjson and other JSON libs that check __json__."""
        return self.model_dump()

    # ── Iteration / len passthrough ──────────────────────────────────────────
    def __iter__(self):
        """
        Iterates over the original if iterable.
        For non-iterable LLM responses (ChatCompletion, Message, etc.),
        falls back to iterating over the content string characters.
        Developers who need streaming should use GuardedStream instead.
        """
        original = object.__getattribute__(self, "_original")
        try:
            return iter(original)
        except TypeError:
            # Non-iterable original (e.g. OpenAI ChatCompletion)
            # Return an iterator over the content string instead
            content = _extract_content(original)
            return iter(content)

    def __len__(self) -> int:
        """
        Returns len of the original if it supports len().
        For objects without __len__, returns len of content string.
        Never raises.
        """
        original = object.__getattribute__(self, "_original")
        try:
            return len(original)
        except TypeError:
            content = _extract_content(original)
            return len(content)

    def __bool__(self) -> bool:
        """Always True — a GuardedResponse is always truthy."""
        return True

    # ── Copy / pickle support ────────────────────────────────────────────────
    def __getstate__(self):
        return {
            "original": object.__getattribute__(self, "_original"),
            "trust": object.__getattribute__(self, "trust"),
        }

    def __setstate__(self, state):
        object.__setattr__(self, "_original", state["original"])
        object.__setattr__(self, "trust", state["trust"])

    def __copy__(self):
        return GuardedResponse(
            original=object.__getattribute__(self, "_original"),
            trust=object.__getattribute__(self, "trust"),
        )

    def __deepcopy__(self, memo):
        import copy
        return GuardedResponse(
            original=copy.deepcopy(object.__getattribute__(self, "_original"), memo),
            trust=object.__getattribute__(self, "trust").model_copy(deep=True),
        )


class GuardConfig(BaseModel):
    """
    Optional per-guard configuration. Pass to @veldrix.guard(config=...).
    All fields have sensible defaults.
    """
    block_on_verdict: list[str] = []           # e.g. ["BLOCK"] — raise on these verdicts
    timeout_ms:       int       = 10_000       # max ms to wait for trust evaluation
    background:       bool      = True         # True = evaluate async, never slows LLM
    on_block:         Optional[Callable[..., Any]] = None  # callable(GuardedResponse) — custom block handler
    include_prompt:   bool      = True         # whether to send the prompt to VeldrixAI
    metadata:         dict      = Field(default_factory=dict)

    model_config = {"arbitrary_types_allowed": True}


def _extract_content(obj: Any) -> str:
    """Extract the text content from any LLM response type."""
    if isinstance(obj, str):
        return obj
    # OpenAI / LiteLLM ChatCompletion
    if hasattr(obj, "choices") and obj.choices:
        choice = obj.choices[0]
        if hasattr(choice, "message") and hasattr(choice.message, "content"):
            return choice.message.content or ""
        if hasattr(choice, "text"):
            return choice.text or ""
    # LangChain AIMessage / BaseMessage
    if hasattr(obj, "content") and isinstance(getattr(obj, "content", None), str):
        return obj.content or ""
    # dict with "content" key
    if isinstance(obj, dict):
        return obj.get("content") or obj.get("text") or obj.get("output") or ""
    # Last resort — short repr, not a massive JSON dump
    s = str(obj)
    return s if len(s) <= 500 else s[:500] + "..."
