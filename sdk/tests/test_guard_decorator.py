import pytest
import asyncio
import json
import copy
from unittest.mock import AsyncMock, MagicMock
from veldrixai        import Veldrix, GuardedResponse
from veldrixai.models import TrustResult, GuardConfig


MOCK_TRUST = TrustResult(
    overall=0.95, verdict="ALLOW",
    pillar_scores={"safety": 0.97, "hallucination": 0.93, "bias": 0.96,
                   "prompt_security": 0.98, "compliance": 0.94},
    request_id="req_test_123", latency_ms=280,
)


def make_veldrix():
    v = Veldrix.__new__(Veldrix)
    mock_client               = MagicMock()
    mock_client.aclose        = AsyncMock()
    v._transport              = MagicMock()
    v._transport.evaluate     = AsyncMock(return_value=MOCK_TRUST)
    v._transport.evaluate_with_client = AsyncMock(return_value=MOCK_TRUST)
    v._transport.evaluate_sync        = MagicMock(return_value=MOCK_TRUST)
    v._transport._make_fresh_client   = MagicMock(return_value=mock_client)
    v._default_cfg            = GuardConfig(background=False)
    return v


# ── Sync decorator ────────────────────────────────────────────────────────────

def test_guard_sync_returns_guarded_response():
    veldrix = make_veldrix()

    @veldrix.guard
    def chat(messages):
        return "The capital of France is Paris."

    result = chat([{"role": "user", "content": "What is the capital of France?"}])
    assert isinstance(result, GuardedResponse)
    assert str(result) == "The capital of France is Paris."
    assert result.trust.verdict == "ALLOW"
    assert result.trust.overall == 0.95


def test_guard_preserves_original_attributes():
    """GuardedResponse must pass through all original object attributes."""
    veldrix = make_veldrix()

    # Build a realistic fake: choices[0].message.content = "Hello"
    fake_message = MagicMock()
    fake_message.content = "Hello"
    fake_choice = MagicMock()
    fake_choice.message = fake_message
    fake_choices = [fake_choice]

    class FakeLLMResponse:
        model   = "gpt-4o"
        choices = fake_choices

    @veldrix.guard
    def chat(messages):
        return FakeLLMResponse()

    result = chat([{"role": "user", "content": "Hi"}])
    assert result.model   == "gpt-4o"
    assert result.content == "Hello"     # extracted via choices[0].message.content
    assert result.choices is not None
    assert result.trust.verdict == "ALLOW"


# ── Async decorator ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_guard_async():
    veldrix = make_veldrix()

    @veldrix.guard
    async def chat(messages):
        return "Async response"

    result = await chat([{"role": "user", "content": "test"}])
    assert isinstance(result, GuardedResponse)
    assert result.trust.overall == 0.95


# ── Block handling ────────────────────────────────────────────────────────────

def test_guard_block_raises():
    from veldrixai.exceptions import VeldrixBlockError

    veldrix = make_veldrix()
    block_trust = TrustResult(
        overall=0.1, verdict="BLOCK",
        pillar_scores={}, critical_flags=["violence"], request_id="r1", latency_ms=100,
    )
    veldrix._transport.evaluate             = AsyncMock(return_value=block_trust)
    veldrix._transport.evaluate_with_client = AsyncMock(return_value=block_trust)
    veldrix._transport.evaluate_sync        = MagicMock(return_value=block_trust)
    veldrix._default_cfg = GuardConfig(background=False, block_on_verdict=["BLOCK"])

    @veldrix.guard
    def chat(messages):
        return "bad response"

    with pytest.raises(VeldrixBlockError):
        chat([{"role": "user", "content": "harmful prompt"}])


# ── functools.wraps ───────────────────────────────────────────────────────────

def test_guard_preserves_function_name():
    veldrix = make_veldrix()

    @veldrix.guard
    def my_special_chatbot(messages):
        return "ok"

    assert my_special_chatbot.__name__ == "my_special_chatbot"


# ── evaluate_sync ─────────────────────────────────────────────────────────────

def test_evaluate_sync():
    veldrix = make_veldrix()
    trust = veldrix.evaluate_sync(prompt="hello", response="world")
    assert trust.verdict == "ALLOW"
    assert trust.overall == 0.95


# ── GuardedResponse serialization ─────────────────────────────────────────────

def test_guarded_response_to_dict():
    guarded = GuardedResponse(original="Hello world", trust=MOCK_TRUST)
    d = guarded.to_dict()
    assert d["content"] == "Hello world"
    assert d["_veldrix_trust"]["verdict"] == "ALLOW"
    # Must be JSON-serializable
    json.dumps(d)


def test_guarded_response_copy():
    guarded = GuardedResponse(original="Hello", trust=MOCK_TRUST)
    shallow = copy.copy(guarded)
    assert shallow.content == "Hello"
    assert shallow.trust.verdict == "ALLOW"


def test_guarded_response_repr():
    guarded = GuardedResponse(original="Hello", trust=MOCK_TRUST)
    r = repr(guarded)
    assert "GuardedResponse" in r
    assert "str" in r  # original_type=str


# ── TrustResult helpers ──────────────────────────────────────────────────────

def test_trust_result_passed():
    assert MOCK_TRUST.passed is True
    assert MOCK_TRUST.blocked is False

    blocked = TrustResult(overall=0.1, verdict="BLOCK", pillar_scores={})
    assert blocked.passed is False
    assert blocked.blocked is True


# ── Fix 3 — GuardedResponse iter / len safety ─────────────────────────────────

def test_guarded_response_iter_on_string_original():
    """iter() on a string original must work — not raise."""
    veldrix = make_veldrix()

    @veldrix.guard
    def chat(messages):
        return "Hello world"

    result = chat([{"role": "user", "content": "hi"}])
    chars  = list(result)
    assert "".join(chars) == "Hello world"


def test_guarded_response_iter_on_openai_style_object():
    """
    iter() on a non-iterable ChatCompletion-style object must NOT raise.
    Falls back to iterating over content string.
    """
    veldrix = make_veldrix()

    class FakeChatCompletion:
        """Simulates OpenAI ChatCompletion — not iterable."""
        model   = "gpt-4o"
        choices = [MagicMock(message=MagicMock(content="Trust is everything"))]
        # No __iter__ — exactly like the real OpenAI response object

    @veldrix.guard
    def chat(messages):
        return FakeChatCompletion()

    result = chat([{"role": "user", "content": "hi"}])

    try:
        chars = list(result)
        # Falls back to content string iteration
        assert "".join(chars) == "Trust is everything"
    except TypeError as e:
        pytest.fail(f"iter() on GuardedResponse raised TypeError: {e}")


def test_guarded_response_len_on_non_sized_object():
    """len() on a non-sized original must NOT raise."""
    veldrix = make_veldrix()

    class FakeChatCompletion:
        choices = [MagicMock(message=MagicMock(content="Length test"))]

    @veldrix.guard
    def chat(messages):
        return FakeChatCompletion()

    result = chat([{"role": "user", "content": "hi"}])
    assert len(result) == len("Length test")


def test_guarded_response_always_truthy():
    """bool(GuardedResponse) must always be True."""
    veldrix = make_veldrix()

    @veldrix.guard
    def chat(messages):
        return ""   # empty string — would be falsy without __bool__

    result = chat([{"role": "user", "content": "hi"}])
    assert bool(result) is True
    assert result   # must pass `if result:` check


# ── Fix 8.2 — GuardedResponse JSON serialization ─────────────────────────────

def test_guarded_response_json_serializable():
    """
    GuardedResponse.model_dump() must return a JSON-serializable dict.
    FastAPI developers return GuardedResponse from endpoints — this must work.
    """
    veldrix = make_veldrix()

    @veldrix.guard
    def chat(messages):
        return "Hello from the AI"

    result = chat([{"role": "user", "content": "hi"}])
    d      = result.model_dump()

    assert isinstance(d, dict)
    assert "_veldrix_trust" in d
    assert d["_veldrix_trust"]["verdict"] == "ALLOW"

    json_str = json.dumps(d)
    assert "ALLOW" in json_str


def test_guarded_response_model_dump_with_object():
    """model_dump() must handle non-dict, non-string originals gracefully."""
    trust   = MOCK_TRUST
    original = MagicMock()
    original.__dict__ = {"model": "gpt-4o", "usage": None}
    guarded = GuardedResponse(original=original, trust=trust)
    d = guarded.model_dump()
    assert "_veldrix_trust" in d
    assert d["_veldrix_trust"]["verdict"] == "ALLOW"


# ── GuardConfig footgun — background=True + block_on_verdict raises VeldrixConfigError ──

def test_guard_config_background_true_with_block_raises():
    """
    GuardConfig(background=True, block_on_verdict=["BLOCK"]) must raise
    VeldrixConfigError immediately at construction time — not silently do nothing.
    """
    from veldrixai.exceptions import VeldrixConfigError
    with pytest.raises(VeldrixConfigError, match="background=False"):
        GuardConfig(background=True, block_on_verdict=["BLOCK"])


def test_guard_config_background_false_with_block_is_valid():
    """background=False + block_on_verdict is the correct combination — must not raise."""
    cfg = GuardConfig(background=False, block_on_verdict=["BLOCK"])
    assert cfg.block_on_verdict == ["BLOCK"]
    assert cfg.background is False


def test_guard_config_background_true_no_block_is_valid():
    """background=True without block_on_verdict is the default — must not raise."""
    cfg = GuardConfig(background=True)
    assert cfg.background is True
    assert cfg.block_on_verdict == []


# ── Missing exception exports are importable from top-level ──────────────────

def test_rate_limit_error_importable_from_top_level():
    from veldrixai import VeldrixRateLimitError
    assert VeldrixRateLimitError is not None


def test_service_unavailable_error_importable_from_top_level():
    from veldrixai import VeldrixServiceUnavailableError
    assert VeldrixServiceUnavailableError is not None


def test_config_error_importable_from_top_level():
    from veldrixai import VeldrixConfigError
    assert VeldrixConfigError is not None


# ── GuardedResponse.__str__ never raises on broken originals ─────────────────

def test_guarded_response_str_never_raises_on_broken_original():
    """str(response) must never raise even if the original object is broken."""
    class BrokenOriginal:
        @property
        def content(self):
            raise RuntimeError("broken")
        @property
        def choices(self):
            raise RuntimeError("broken")

    trust   = MOCK_TRUST
    guarded = GuardedResponse(original=BrokenOriginal(), trust=trust)
    result  = str(guarded)   # must not raise
    assert isinstance(result, str)


# ── Fix 8.3/8.4 — API key validation + from_env() ────────────────────────────

def test_veldrix_rejects_empty_api_key():
    from veldrixai.exceptions import VeldrixError
    with pytest.raises(VeldrixError, match="api_key is required"):
        Veldrix(api_key="")


def test_veldrix_rejects_none_api_key():
    from veldrixai.exceptions import VeldrixError
    with pytest.raises(VeldrixError):
        Veldrix(api_key=None)


def test_veldrix_rejects_wrong_prefix():
    from veldrixai.exceptions import VeldrixError
    with pytest.raises(VeldrixError, match="vx-"):
        Veldrix(api_key="sk-wrong-format-key")


def test_from_env_reads_api_key(monkeypatch):
    monkeypatch.setenv("VELDRIX_API_KEY", "vx-test-from-env-123")
    veldrix = Veldrix.from_env()
    assert veldrix is not None


def test_from_env_raises_when_key_missing(monkeypatch):
    from veldrixai.exceptions import VeldrixError
    monkeypatch.delenv("VELDRIX_API_KEY", raising=False)
    with pytest.raises(VeldrixError, match="VELDRIX_API_KEY"):
        Veldrix.from_env()


def test_from_env_custom_var_name(monkeypatch):
    monkeypatch.setenv("MY_TRUST_KEY", "vx-test-custom-456")
    veldrix = Veldrix.from_env(api_key_env="MY_TRUST_KEY")
    assert veldrix is not None
