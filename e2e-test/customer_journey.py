"""
VeldrixAI — End-to-End Customer Journey
========================================
Simulates exactly what a real customer does:

  1. Build an AI agent with OpenAI.
  2. Wrap its LLM call with a single @veldrix.guard decorator.
  3. Send prompts through the agent.
  4. Get back the OpenAI answer PLUS a VeldrixAI five-pillar trust verdict.

Run in BLOCKING mode (background=False) so we actually wait for the trust
result and can print a real verdict — instead of the default async PENDING.

Setup:
  1. Put your keys in  e2e-test/.env   (copy from .env.example)
  2. python e2e-test/customer_journey.py
"""

from __future__ import annotations
import os
import sys
import time
from pathlib import Path


# ── Tiny zero-dependency .env loader ─────────────────────────────────────────
def load_env(path: Path) -> None:
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        os.environ.setdefault(key.strip(), val.strip().strip('"').strip("'"))


load_env(Path(__file__).with_name(".env"))


# ── Preflight: keys present? ─────────────────────────────────────────────────
VELDRIX_KEY = os.environ.get("VELDRIX_API_KEY", "")
OPENAI_KEY  = os.environ.get("OPENAI_API_KEY", "")
BASE_URL    = os.environ.get("VELDRIX_BASE_URL", "https://api.veldrixai.ca")

missing = [name for name, val in (("VELDRIX_API_KEY", VELDRIX_KEY),
                                  ("OPENAI_API_KEY", OPENAI_KEY)) if not val]
if missing:
    print(f"✗ Missing required env var(s): {', '.join(missing)}")
    print("  Add them to e2e-test/.env  (see e2e-test/.env.example)")
    sys.exit(1)


# ── Imports (after key check so errors are friendlier) ───────────────────────
from openai import OpenAI
from veldrixai import Veldrix, GuardConfig
from veldrixai import (
    VeldrixError, VeldrixAuthError, VeldrixBlockError,
    VeldrixTimeoutError, VeldrixServiceUnavailableError,
)


# ── 1. The customer's AI agent ───────────────────────────────────────────────
openai_client = OpenAI(api_key=OPENAI_KEY)

veldrix = Veldrix(
    api_key=VELDRIX_KEY,
    base_url=BASE_URL,
    metadata={"app": "e2e-customer-journey", "env": "test"},
)

SYSTEM_PROMPT = (
    "You are Aria, a concise customer-support agent for a fintech app. "
    "Answer in 2-3 sentences. Be helpful, accurate, and never invent account details."
)


# background=False → wait for the trust verdict so this E2E test can assert on it.
@veldrix.guard(config=GuardConfig(background=False))
def agent_reply(user_message: str):
    return openai_client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user",   "content": user_message},
        ],
    )


# ── 2. Pretty-printer for a trust result ─────────────────────────────────────
VERDICT_ICON = {
    "ALLOW": "✓", "WARN": "⚠", "REVIEW": "⚑",
    "BLOCK": "✗", "PENDING": "…", "UNKNOWN": "?",
}


def show(turn: int, prompt: str, response) -> None:
    answer = response.choices[0].message.content.strip()
    t = response.trust

    print(f"\n{'─' * 70}")
    print(f"TURN {turn}  ·  user: {prompt}")
    print(f"{'─' * 70}")
    print(f"🤖 agent: {answer}")
    print()
    icon = VERDICT_ICON.get(t.verdict, "?")
    print(f"🛡  VeldrixAI verdict : {icon} {t.verdict}   (trust {t.overall:.0%})")
    print(f"   request_id        : {t.request_id}")
    print(f"   eval latency      : {t.latency_ms} ms")
    if t.is_degraded:
        print("   ⚠ DEGRADED — Veldrix could not score this exchange "
              "(network/timeout). LLM answer was still returned.")
    if t.pillar_scores:
        print("   pillars:")
        for pillar, score in t.pillar_scores.items():
            bar = "█" * round(score * 20)
            print(f"     {pillar:<18} {score:>4.0%}  {bar}")
    if t.critical_flags:
        print(f"   ⚑ critical flags  : {', '.join(t.critical_flags)}")


# ── 3. Run the journey ───────────────────────────────────────────────────────
def main() -> int:
    print("=" * 70)
    print("VeldrixAI E2E Customer Journey")
    print(f"  SDK client : {veldrix!r}")
    print(f"  Backend    : {BASE_URL}")
    print(f"  Agent model: gpt-4o-mini")
    print("=" * 70)

    prompts = [
        "How do I reset my account password?",
        "What's a good way to budget my monthly paycheck?",
    ]

    ok = 0
    for i, prompt in enumerate(prompts, 1):
        try:
            t0 = time.time()
            response = agent_reply(prompt)
            wall = (time.time() - t0) * 1000
            show(i, prompt, response)
            print(f"   end-to-end wall   : {wall:.0f} ms")
            ok += 1
        except VeldrixAuthError as e:
            print(f"\n✗ AUTH ERROR — your VeldrixAI key was rejected:\n  {e}")
            return 2
        except VeldrixBlockError as e:
            print(f"\n🛡  BLOCKED by VeldrixAI policy: {e}")
            ok += 1  # blocking working as designed still counts as SDK working
        except (VeldrixTimeoutError, VeldrixServiceUnavailableError) as e:
            print(f"\n⚠ Veldrix backend unreachable/timeout: {e}")
        except VeldrixError as e:
            print(f"\n✗ Veldrix SDK error: {e}")

    # ── 4. SDK observability ────────────────────────────────────────────────
    print(f"\n{'=' * 70}")
    print("SDK stats:", veldrix.stats())
    print(f"Result: {ok}/{len(prompts)} turns evaluated by VeldrixAI.")
    print("Look up any request_id above in your dashboard → Audit Logs to")
    print("confirm the evaluation landed server-side.")
    print("=" * 70)
    return 0 if ok == len(prompts) else 1


if __name__ == "__main__":
    raise SystemExit(main())
