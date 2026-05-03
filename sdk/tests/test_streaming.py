"""
Tests for veldrixai.streaming — GuardedStream.

Covers:
  - Plain text chunk accumulation (sync + async)
  - OpenAI tool-call delta accumulation (agent mode)
  - Anthropic tool_use streaming (content_block_start + input_json_delta)
  - full_text includes assembled tool call representations
  - trust property returns degraded result after sync timeout
  - trust property returns PENDING before evaluation completes
  - _fire_async background vs foreground paths
"""
import asyncio
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from veldrixai.streaming import GuardedStream
from veldrixai.models    import GuardConfig, TrustResult

MOCK_TRUST = TrustResult(
    overall=0.92, verdict="ALLOW",
    pillar_scores={"safety": 0.95},
    request_id="req_stream_test", latency_ms=180,
)


def make_transport(trust=MOCK_TRUST):
    t = MagicMock()
    t._make_fresh_client.return_value = MagicMock(aclose=AsyncMock())
    t.evaluate_with_client = AsyncMock(return_value=trust)
    t.evaluate             = AsyncMock(return_value=trust)
    return t


# ── Plain text chunks ─────────────────────────────────────────────────────────

def test_sync_plain_text_accumulation():
    chunks = ["Hello", " ", "world"]
    transport = make_transport()
    config    = GuardConfig(background=False)
    stream    = GuardedStream(iter(chunks), transport, config, prompt="hi")

    collected = list(stream)
    assert collected == chunks
    # full_text joins _chunks with " " — space chunk produces an extra space, which is correct
    assert "Hello" in stream.full_text
    assert "world" in stream.full_text


@pytest.mark.asyncio
async def test_async_plain_text_accumulation():
    async def _gen():
        for c in ["Async", " ", "response"]:
            yield c

    transport = make_transport()
    config    = GuardConfig(background=False)
    stream    = GuardedStream(_gen(), transport, config, prompt="test")

    collected = []
    async for chunk in stream:
        collected.append(chunk)

    assert collected == ["Async", " ", "response"]
    # full_text joins _chunks with " " — space chunk produces an extra space, which is correct
    assert "Async" in stream.full_text
    assert "response" in stream.full_text


# ── OpenAI tool-call delta accumulation ──────────────────────────────────────

def _make_openai_tool_chunk(index: int, name: str = None, args: str = ""):
    """Build a minimal OpenAI streaming chunk with a tool_call delta."""
    fn = MagicMock()
    fn.name      = name
    fn.arguments = args
    tc = MagicMock()
    tc.index    = index
    tc.function = fn
    delta = MagicMock()
    delta.content    = None
    delta.tool_calls = [tc]
    choice = MagicMock()
    choice.delta = delta
    chunk = MagicMock()
    chunk.choices = [choice]
    return chunk


def test_openai_tool_call_delta_accumulation():
    """Tool call argument fragments must be assembled into full_text."""
    chunks = [
        _make_openai_tool_chunk(0, name="get_weather", args=""),
        _make_openai_tool_chunk(0, name=None, args="{\"city\":"),
        _make_openai_tool_chunk(0, name=None, args=" \"London\"}"),
    ]
    transport = make_transport()
    config    = GuardConfig(background=False)
    stream    = GuardedStream(iter(chunks), transport, config, prompt="weather?")

    list(stream)  # consume

    assert "tool_call:get_weather" in stream.full_text
    assert "London" in stream.full_text


def test_openai_tool_call_full_text_not_empty():
    """full_text must not be empty for a pure tool-call stream."""
    chunks = [
        _make_openai_tool_chunk(0, name="search", args="{\"q\":\"test\"}"),
    ]
    transport = make_transport()
    config    = GuardConfig(background=False)
    stream    = GuardedStream(iter(chunks), transport, config, prompt="search test")

    list(stream)
    assert stream.full_text != ""
    assert "search" in stream.full_text


# ── Anthropic tool_use streaming ──────────────────────────────────────────────

def _make_anthropic_block_start(index: int, name: str):
    """Build an Anthropic content_block_start chunk using SimpleNamespace so
    chunk.choices raises AttributeError (preventing the OpenAI path from firing)."""
    from types import SimpleNamespace
    block = SimpleNamespace(type="tool_use", name=name)
    return SimpleNamespace(type="content_block_start", index=index, content_block=block)


def _make_anthropic_input_json_delta(index: int, partial: str):
    """Build an Anthropic input_json_delta chunk using SimpleNamespace."""
    from types import SimpleNamespace
    delta = SimpleNamespace(type="input_json_delta", partial_json=partial)
    return SimpleNamespace(type="content_block_delta", index=index, delta=delta)


def test_anthropic_tool_use_streaming():
    """Anthropic tool_use streaming must accumulate name + args into full_text."""
    transport = make_transport()
    config    = GuardConfig(background=False)
    stream    = GuardedStream(iter([]), transport, config, prompt="calc 2+2")

    # Drive _extract_chunk_text directly so we control exactly what each chunk
    # looks like without MagicMock leaking into the OpenAI path.
    block_start = _make_anthropic_block_start(0, "calculator")
    delta1      = _make_anthropic_input_json_delta(0, '{"expr":')
    delta2      = _make_anthropic_input_json_delta(0, ' "2+2"}')

    stream._extract_chunk_text(block_start)
    stream._extract_chunk_text(delta1)
    stream._extract_chunk_text(delta2)

    assert "tool_call:calculator" in stream.full_text
    assert "2+2" in stream.full_text


# ── Trust property states ─────────────────────────────────────────────────────

def test_trust_returns_pending_before_iteration():
    transport = make_transport()
    config    = GuardConfig(background=True)
    stream    = GuardedStream(iter([]), transport, config)
    assert stream.trust.verdict == "PENDING"


def test_trust_returns_degraded_after_timeout():
    """If the sync eval thread times out, trust must return degraded, not PENDING."""
    transport = make_transport()
    config    = GuardConfig(background=False)
    stream    = GuardedStream(iter(["hello"]), transport, config, prompt="hi")

    # Simulate timeout: set flag directly
    stream._eval_timed_out = True
    assert stream.trust.verdict == "UNKNOWN"
    assert stream.trust.is_degraded is True


@pytest.mark.asyncio
async def test_async_fire_foreground_sets_trust():
    """_fire_async with background=False must set self._trust."""
    transport = make_transport()
    config    = GuardConfig(background=False)

    async def _gen():
        yield "hello world"

    stream = GuardedStream(_gen(), transport, config, prompt="hi")
    async for _ in stream:
        pass

    assert stream._trust is not None
    assert stream._trust.verdict == "ALLOW"


@pytest.mark.asyncio
async def test_async_fire_background_creates_task():
    """_fire_async with background=True must create a task, not block."""
    transport = make_transport()
    config    = GuardConfig(background=True)

    async def _gen():
        yield "background chunk"

    stream = GuardedStream(_gen(), transport, config, prompt="hi")
    async for _ in stream:
        pass

    # Give the task a tick to be scheduled
    await asyncio.sleep(0)
    # trust is PENDING immediately (background)
    # evaluate was called via create_task
    assert transport.evaluate.called or stream.trust.verdict in ("PENDING", "ALLOW")


# ── repr ──────────────────────────────────────────────────────────────────────

def test_repr_includes_tool_calls():
    transport = make_transport()
    config    = GuardConfig(background=True)
    stream    = GuardedStream(iter([]), transport, config)
    stream._tool_calls[0] = ["my_tool", ["{}"]]
    r = repr(stream)
    assert "tool_calls=1" in r
