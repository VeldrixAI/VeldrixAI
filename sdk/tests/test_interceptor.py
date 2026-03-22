import threading
import pytest
import respx
import httpx
from veldrixai.adapters.generic   import extract_prompt, extract_response
from veldrixai.adapters.openai    import extract_prompt as openai_prompt
from veldrixai.adapters.langchain import extract_prompt as lc_prompt
from unittest.mock import MagicMock


def test_generic_extracts_last_user_message():
    messages = [
        {"role": "system", "content": "You are helpful."},
        {"role": "user",   "content": "What is 2+2?"},
    ]
    assert extract_prompt((messages,), {}) == "What is 2+2?"


def test_generic_extracts_from_kwarg():
    messages = [{"role": "user", "content": "Hello"}]
    assert extract_prompt((), {"messages": messages}) == "Hello"


def test_generic_extracts_string_response():
    assert extract_response("Simple string response") == "Simple string response"


def test_openai_extracts_user_message():
    messages = [{"role": "user", "content": "Tell me a joke."}]
    assert openai_prompt((), {"messages": messages}) == "Tell me a joke."


def test_langchain_extracts_input_dict():
    assert lc_prompt(({"input": "What is AI?"},), {}) == "What is AI?"


def test_langchain_extracts_string_arg():
    assert lc_prompt(("Direct string",), {}) == "Direct string"


# ── Fix 1 — Concurrent sync calls must never crash ───────────────────────────

def test_concurrent_sync_calls_never_crash():
    """
    Fires 20 concurrent sync-guarded calls in separate threads.
    None may raise. This is the exact pattern that previously caused
    'Event loop is closed' / 'Task attached to a different loop'.
    """
    from veldrixai import Veldrix

    results = []
    errors  = []
    lock    = threading.Lock()

    mock_resp = {
        "request_id": "req_concurrent",
        "trust_score": {
            "overall": 0.91, "verdict": "ALLOW",
            "pillar_scores": {"safety": 0.95},
            "critical_flags": [], "all_flags": [],
        },
        "pillars": {},
        "total_latency_ms": 200,
        "sdk_version": "1.0.0",
    }

    veldrix = Veldrix(api_key="vx-test-concurrent", background=False)

    with respx.mock(base_url="https://api.veldrix.ai") as rx:
        rx.post("/api/v1/analyze").mock(
            return_value=httpx.Response(200, json=mock_resp)
        )

        @veldrix.guard
        def chat(messages):
            return "response text"

        def worker(i):
            try:
                r = chat([{"role": "user", "content": f"message {i}"}])
                with lock:
                    results.append(r.trust.verdict)
            except Exception as e:
                with lock:
                    errors.append(str(e))

        threads = [threading.Thread(target=worker, args=(i,)) for i in range(20)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=30)

    assert errors == [], f"Concurrent calls raised: {errors}"
    assert len(results) == 20
    assert all(v == "ALLOW" for v in results)
