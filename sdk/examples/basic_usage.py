"""
VeldrixAI Python SDK — Basic Usage Example

Demonstrates:
  - Sync and async evaluation
  - @veldrix.guard decorator
  - Manual evaluate() escape hatch
  - Block handling
  - Error handling

Run:
    pip install veldrixai
    python examples/basic_usage.py
"""

from veldrixai import (
    Veldrix,
    GuardConfig,
    VeldrixBlockError,
    VeldrixAuthError,
    VeldrixError,
)

# ── Create client ─────────────────────────────────────────────────────────────
veldrix = Veldrix(
    api_key="vx-live-your-key-here",
    base_url="http://localhost:8001",   # self-hosted; omit for SaaS
)


# ── Option 1: Decorator (recommended) ────────────────────────────────────────
@veldrix.guard
def chat(messages):
    # Replace with your real LLM call (OpenAI, LiteLLM, Anthropic, etc.)
    return "Regular exercise improves cardiovascular health and reduces stress."


# ── Option 2: Decorator with blocking ────────────────────────────────────────
@veldrix.guard(config=GuardConfig(block_on_verdict=["BLOCK"], background=False))
def safe_chat(messages):
    return "This is a safe response."


# ── Option 3: Sync manual evaluation ─────────────────────────────────────────
def manual_example():
    trust = veldrix.evaluate_sync(
        prompt="What are the health benefits of exercise?",
        response="Regular exercise improves cardiovascular health.",
    )
    print(f"Verdict:     {trust.verdict}")
    print(f"Trust Score: {trust.overall:.0%}")
    print(f"Passed:      {trust.passed}")
    for name, score in trust.pillar_scores.items():
        print(f"  {name:<20} {score:.0%}")


if __name__ == "__main__":
    # Decorator usage
    try:
        response = chat([{"role": "user", "content": "Health benefits of exercise?"}])
        print(f"Response: {response.content}")
        print(f"Verdict:  {response.trust.verdict}")
        print(f"Score:    {response.trust.overall:.0%}")
    except VeldrixAuthError:
        print("Authentication failed — check your API key.")
    except VeldrixBlockError as e:
        print(f"Blocked: {e}")
    except VeldrixError as e:
        print(f"VeldrixAI error: {e}")

    print()

    # Manual evaluation
    try:
        manual_example()
    except VeldrixAuthError:
        print("Authentication failed — check your API key.")
