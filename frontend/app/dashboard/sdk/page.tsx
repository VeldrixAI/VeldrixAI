"use client";

import { useState } from "react";

// ── Constants ────────────────────────────────────────────────────────────────
const VERSION       = "1.0.1";
const INSTALL_CMD   = "pip install veldrixai";
const GITHUB_URL    = "https://github.com/veldrixai/veldrixai-python";
const PYPI_URL      = "https://pypi.org/project/veldrixai/";
const DOCS_URL      = "https://docs.veldrixai.ca";
const DASHBOARD_URL = "https://app.veldrixai.ca";

// ── Helpers ──────────────────────────────────────────────────────────────────
function CodeBlock({
  lang,
  code,
  id,
  copiedId,
  onCopy,
  maxH,
}: {
  lang: string;
  code: string;
  id: string;
  copiedId: string | null;
  onCopy: (text: string, id: string) => void;
  maxH?: number;
}) {
  return (
    <div style={{ background: "#121d23", borderRadius: 12, overflow: "hidden", border: "1px solid rgba(255,255,255,0.07)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 16px", background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
        <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, fontWeight: 600, color: "rgba(231,236,239,0.4)", textTransform: "uppercase", letterSpacing: "1.5px" }}>{lang}</span>
        <button
          onClick={() => onCopy(code, id)}
          style={{ background: "rgba(45,74,94,0.12)", border: "1px solid rgba(45,74,94,0.2)", color: copiedId === id ? "#6fa98f" : "rgba(197,207,213,0.8)", padding: "3px 10px", borderRadius: 6, fontSize: 11, cursor: "pointer", fontFamily: "DM Sans, sans-serif", fontWeight: 600, transition: "all 0.15s" }}
        >
          {copiedId === id ? "✓ Copied" : "Copy"}
        </button>
      </div>
      <div style={{ padding: "16px 18px", overflowX: "auto", ...(maxH ? { maxHeight: maxH, overflowY: "auto" } : {}) }}>
        <pre style={{ margin: 0, fontFamily: "JetBrains Mono, monospace", fontSize: 12.5, lineHeight: 1.7, color: "#c5cfd5", whiteSpace: "pre" }}>
          <code>{code}</code>
        </pre>
      </div>
    </div>
  );
}

function Section({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} style={{ marginBottom: "2.5rem" }}>
      <h2 style={{ fontFamily: "Syne, sans-serif", fontWeight: 800, fontSize: "1.2rem", color: "#e7ecef", marginBottom: "1rem", paddingBottom: "0.5rem", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "1.5rem" }}>
      <h3 style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: "0.95rem", color: "rgba(197,207,213,0.9)", marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "8px" }}>
        <span style={{ width: 3, height: 14, background: "rgba(45,74,94,0.7)", borderRadius: 2, display: "inline-block", flexShrink: 0 }} />
        {title}
      </h3>
      {children}
    </div>
  );
}

function InfoBox({ type, children }: { type: "tip" | "warn" | "info"; children: React.ReactNode }) {
  const styles = {
    tip:  { bg: "rgba(111,169,143,0.06)",  border: "rgba(111,169,143,0.2)",  icon: "✓",  color: "#6fa98f" },
    warn: { bg: "rgba(194,160,106,0.06)",  border: "rgba(194,160,106,0.2)",  icon: "⚠",  color: "#c2a06a" },
    info: { bg: "rgba(170,184,192,0.06)",   border: "rgba(170,184,192,0.2)",   icon: "ℹ",  color: "#aab8c0" },
  };
  const s = styles[type];
  return (
    <div style={{ background: s.bg, border: `1px solid ${s.border}`, borderLeft: `3px solid ${s.color}`, borderRadius: "0 10px 10px 0", padding: "12px 16px", marginBottom: "1rem", display: "flex", gap: 10, alignItems: "flex-start" }}>
      <span style={{ color: s.color, fontWeight: 700, fontSize: 13, flexShrink: 0 }}>{s.icon}</span>
      <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 13, color: "rgba(231,236,239,0.65)", lineHeight: 1.6 }}>{children}</div>
    </div>
  );
}

function PropRow({ name, type, dflt, desc }: { name: string; type: string; dflt?: string; desc: string }) {
  return (
    <div className="vx-doc-row vx-doc-row-a" style={{ padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
      <code style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: "#c5cfd5" }}>{name}</code>
      <code style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#abc8bd" }}>{type}</code>
      <div>
        {dflt && <code style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "rgba(231,236,239,0.35)", marginRight: 8 }}>{dflt}</code>}
        <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: 12.5, color: "rgba(231,236,239,0.5)" }}>{desc}</span>
      </div>
    </div>
  );
}

// ── Code strings ─────────────────────────────────────────────────────────────

const CODE_INSTALL = `pip install veldrixai

# With optional provider extras:
pip install "veldrixai[openai]"
pip install "veldrixai[anthropic]"
pip install "veldrixai[langchain]"
pip install "veldrixai[litellm]"
pip install "veldrixai[all]"          # all providers`;

const CODE_ENV = `# Set once — never hard-code your key in source
export VELDRIX_API_KEY=vx-live-your-key-here`;

const CODE_INIT = `import os
from veldrixai import Veldrix

# Recommended: read from environment
veldrix = Veldrix.from_env()   # reads VELDRIX_API_KEY automatically

# Or pass explicitly
veldrix = Veldrix(api_key=os.environ["VELDRIX_API_KEY"])

# Keys must start with vx-live- (production) or vx-test- (testing)
# Get yours: https://app.veldrixai.ca/settings/api-keys`;

const CODE_GUARD_OPENAI = `from veldrixai import Veldrix
from openai import OpenAI

openai_client = OpenAI()
veldrix = Veldrix.from_env()

# One decorator — every call is evaluated automatically
@veldrix.guard
def chat(messages):
    return openai_client.chat.completions.create(
        model="gpt-4o",
        messages=messages,
    )

response = chat([{"role": "user", "content": "Hello!"}])

# Original response is fully preserved — nothing breaks
print(response.choices[0].message.content)

# VeldrixAI adds .trust to every response
print(response.trust.verdict)          # ALLOW | WARN | REVIEW | BLOCK
print(f"{response.trust.overall:.0%}") # e.g. 94%
print(response.trust.request_id)       # trace ID for dashboard lookup`;

const CODE_GUARD_ASYNC = `from veldrixai import Veldrix
from openai import AsyncOpenAI
import asyncio

client  = AsyncOpenAI()
veldrix = Veldrix.from_env()

# Works identically on async functions — @veldrix.guard detects coroutines
@veldrix.guard
async def chat(messages):
    return await client.chat.completions.create(
        model="gpt-4o",
        messages=messages,
    )

async def main():
    response = await chat([{"role": "user", "content": "Explain black holes."}])
    print(response.choices[0].message.content)
    print(f"Trust: {response.trust.verdict} ({response.trust.overall:.0%})")

asyncio.run(main())`;

const CODE_GUARD_LITELLM = `from veldrixai import Veldrix
from litellm import completion

veldrix = Veldrix.from_env()

@veldrix.guard
def chat(messages):
    return completion(model="openai/gpt-4o", messages=messages)

response = chat([{"role": "user", "content": "What is quantum entanglement?"}])

print(response.choices[0].message.content)
print(f"Verdict:     {response.trust.verdict}")
print(f"Trust Score: {response.trust.overall:.0%}")
print(f"Request ID:  {response.trust.request_id}")

# Per-pillar scores (0.0 – 1.0)
for pillar, score in response.trust.pillar_scores.items():
    print(f"  {pillar:<22} {score:.0%}")

# Output:
#   safety                 98%
#   hallucination          84%
#   bias                   91%
#   prompt_security        97%
#   compliance             89%`;

const CODE_GUARD_LANGCHAIN = `from veldrixai import Veldrix
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage

veldrix = Veldrix.from_env()
llm     = ChatOpenAI(model="gpt-4o")

@veldrix.guard
def chat(user_input: str):
    return llm.invoke([HumanMessage(content=user_input)])

response = chat("Summarise the French Revolution in 3 sentences.")
print(response.content)              # LangChain AIMessage.content — unchanged
print(response.trust.verdict)        # VeldrixAI verdict
print(response.trust.overall)        # 0.0 – 1.0`;

const CODE_TRUST_RESULT = `response = chat(messages)
trust = response.trust       # TrustResult object

# Core fields
trust.verdict          # str  — ALLOW | WARN | REVIEW | BLOCK | PENDING | UNKNOWN
trust.overall          # float 0.0–1.0 (weighted aggregate of all pillars)
trust.pillar_scores    # dict[str, float] — per-pillar 0.0–1.0
trust.pillars          # list[PillarScore] — full per-pillar breakdown with flags
trust.critical_flags   # list[str] — human-readable triggered rule names
trust.all_flags        # list[str] — all flags including non-critical
trust.request_id       # str — trace ID, look it up in the Audit Logs dashboard
trust.latency_ms       # int — evaluation latency in milliseconds

# Convenience properties
trust.passed           # True only if verdict == "ALLOW"
trust.blocked          # True only if verdict == "BLOCK"
trust.needs_review     # True if verdict in ("WARN", "REVIEW")
trust.is_degraded      # True if evaluation failed silently (network/timeout)
                       # LLM response was still returned — Veldrix just couldn't score it

# PillarScore breakdown
for p in trust.pillars:
    print(p.name)         # e.g. "Safety & Toxicity Analysis"
    print(p.score)        # float 0.0–1.0, or None if pillar errored
    print(p.flags)        # list[str] triggered on this pillar
    print(p.latency_ms)   # int

# Verdicts explained:
# ALLOW   → all pillars passed thresholds — safe to use
# WARN    → borderline scores, recommend human review
# REVIEW  → one or more pillars borderline, escalate
# BLOCK   → high-risk content detected, must not be used
# PENDING → background evaluation in-flight (trust.overall is 0.0)
# UNKNOWN → evaluation failed silently (degraded mode)`;

const CODE_BLOCKING = `from veldrixai import Veldrix, GuardConfig, VeldrixBlockError

veldrix = Veldrix.from_env()

# background=False means: wait for trust result before returning
# block_on_verdict: raise VeldrixBlockError if verdict matches
@veldrix.guard(config=GuardConfig(
    background=False,
    block_on_verdict=["BLOCK"],
))
def chat(messages):
    return openai_client.chat.completions.create(
        model="gpt-4o",
        messages=messages,
    )

try:
    response = chat([{"role": "user", "content": "..."}])
    print(response.trust.verdict)   # ALLOW or WARN
except VeldrixBlockError:
    # Verdict was BLOCK — handle gracefully
    return {"error": "I can't help with that."}

# Custom block handler via on_block callback
@veldrix.guard(config=GuardConfig(
    background=False,
    block_on_verdict=["BLOCK", "WARN"],
    on_block=lambda trust: log_blocked(trust.request_id, trust.critical_flags),
))
def safe_chat(messages):
    ...`;

const CODE_GLOBAL_INTERCEPT = `from veldrixai import Veldrix
from veldrixai.http_interceptor import enable_global_intercept

# One call — monitors ALL subsequent AI HTTP requests automatically
veldrix = Veldrix.from_env()
enable_global_intercept(veldrix)

# Use any AI SDK exactly as before — no other changes needed
import anthropic
ant = anthropic.Anthropic(api_key="your-anthropic-key")
message = ant.messages.create(
    model="claude-opus-4-6",
    max_tokens=1024,
    messages=[{"role": "user", "content": "What is the capital of France?"}],
)
print(message.content[0].text)
# ↑ VeldrixAI evaluated this exchange in the background

# Works with httpx, requests, openai, anthropic, boto3, and
# any library that uses them — zero per-call changes.

# Optional: receive a callback after every evaluation
def on_eval(prompt, response, trust):
    print(f"[AUDIT] {trust.verdict} | {trust.overall:.0%} | {trust.request_id}")

enable_global_intercept(veldrix, on_result=on_eval)

# Disable if needed (useful in tests)
from veldrixai.http_interceptor import disable_global_intercept
disable_global_intercept()`;

const CODE_FASTAPI = `from fastapi import FastAPI
from contextlib import asynccontextmanager
from veldrixai.middleware import VeldrixMiddleware

app = FastAPI()

# Add middleware — evaluates AI requests in the background
# Zero latency added to your endpoints
app.add_middleware(
    VeldrixMiddleware,
    api_key="vx-live-your-key-here",      # or use from_env() pattern
    capture_paths=["/api/chat", "/api/"],  # only monitor these prefixes
    exclude_paths=["/health", "/metrics"], # always skip these
    trust_headers=True,                    # add X-Veldrix-Trust-Score response header
    metadata={"env": "production"},        # merged into every evaluation
    on_result=lambda p, r, t: print(f"[{t.verdict}] {t.overall:.0%}"),
)

@app.post("/api/chat")
async def chat(body: dict):
    import openai
    client   = openai.AsyncOpenAI()
    response = await client.chat.completions.create(
        model="gpt-4o",
        messages=body.get("messages", []),
    )
    return {"response": response.choices[0].message.content}

# ── Clean shutdown (prevents task GC warnings) ────────────────────────────────
# Access the middleware instance for explicit shutdown:
_veldrix_mw = None

@asynccontextmanager
async def lifespan(app):
    yield
    if _veldrix_mw:
        await _veldrix_mw.shutdown()`;

const CODE_FLASK = `from flask import Flask
from veldrixai.middleware import init_flask

app = Flask(__name__)

# One-line integration — background evaluation with bounded thread pool
init_flask(
    app,
    api_key="vx-live-your-key-here",
    metadata={"service": "my-flask-app"},
    on_result=lambda p, r, t: print(f"[{t.verdict}] {t.overall:.0%}"),
)

@app.route("/chat", methods=["POST"])
def chat():
    import openai, flask
    body    = flask.request.get_json()
    client  = openai.OpenAI()
    resp    = client.chat.completions.create(
        model="gpt-4o",
        messages=body.get("messages", []),
    )
    return {"response": resp.choices[0].message.content}`;

const CODE_MANUAL_SYNC = `from veldrixai import Veldrix

veldrix = Veldrix.from_env()

# Use when you already have the prompt and response and just want scores
trust = veldrix.evaluate_sync(
    prompt="What is the speed of light?",
    response="The speed of light is approximately 299,792,458 metres per second.",
    metadata={"user_id": "u_123", "session_id": "sess_abc"},
)

print(trust.verdict)           # ALLOW
print(trust.overall)           # 0.97
print(trust.pillar_scores)     # {"safety": 0.99, "hallucination": 0.95, ...}
print(trust.critical_flags)    # []

# Safe everywhere — scripts, Django views, Jupyter notebooks,
# even inside a running event loop (uses thread isolation internally).`;

const CODE_MANUAL_ASYNC = `from veldrixai import Veldrix
import asyncio

veldrix = Veldrix.from_env()

async def evaluate_exchange(prompt: str, response: str):
    trust = await veldrix.evaluate(
        prompt=prompt,
        response=response,
        metadata={"workflow": "content-moderation"},
    )
    return trust

# Optional on_result callback
async def run():
    def log(p, r, t):
        print(f"verdict={t.verdict} score={t.overall:.0%}")

    trust = await veldrix.evaluate(
        prompt="...", response="...", on_result=log
    )

asyncio.run(run())`;

const CODE_CONTEXT_MANAGER = `from veldrixai import Veldrix
import asyncio

veldrix = Veldrix.from_env()

# For dynamic / conditional guarding — wrap any callable
async def process():
    async with veldrix.session() as session:
        # session.wrap(fn, *args, **kwargs) — calls fn and adds .trust
        response = await session.wrap(my_llm_fn, messages)
        print(response.trust.verdict)

# Veldrix itself is also an async context manager for clean transport shutdown
async def app_lifetime():
    async with Veldrix.from_env() as veldrix:
        response = chat(messages)

asyncio.run(app_lifetime())`;

const CODE_ON_RESULT = `from veldrixai import Veldrix, GuardConfig

veldrix = Veldrix.from_env()

# on_result runs after every evaluation — perfect for audit logging,
# metrics, alerting. Never blocks the LLM response. Exceptions are caught.

def my_audit(prompt: str, response: str, trust):
    if trust.blocked:
        alert_security_team(trust.request_id, trust.critical_flags)
    db.insert_trust_event(
        request_id=trust.request_id,
        verdict=trust.verdict,
        score=trust.overall,
        pillar_scores=trust.pillar_scores,
    )

@veldrix.guard(on_result=my_audit)
def chat(messages):
    return llm_client.chat.completions.create(...)

# Also available on evaluate() / evaluate_sync()
trust = veldrix.evaluate_sync(
    prompt="...", response="...", on_result=my_audit
)`;

const CODE_METADATA = `from veldrixai import Veldrix, GuardConfig

# Client-level metadata — merged into every evaluation
veldrix = Veldrix(
    api_key="vx-live-...",
    metadata={
        "env":     "production",
        "service": "chat-api",
        "region":  "us-east-1",
    },
)

# Per-call metadata override — wins over client-level defaults
@veldrix.guard(config=GuardConfig(
    metadata={
        "user_id":    current_user.id,
        "session_id": session.id,
        "feature":    "onboarding-chat",
    }
))
def chat(messages):
    ...

# Manual evaluation with metadata
trust = veldrix.evaluate_sync(
    prompt="...", response="...",
    metadata={"request_id": req.id, "tenant": "acme"},
)`;

const CODE_ERRORS = `from veldrixai import (
    Veldrix,
    GuardConfig,
    VeldrixError,
    VeldrixAuthError,
    VeldrixTimeoutError,
    VeldrixAPIError,
    VeldrixBlockError,
    VeldrixRateLimitError,
    VeldrixServiceUnavailableError,
    VeldrixConfigError,
)

# Initialisation errors (raised at startup, not at call time)
try:
    veldrix = Veldrix(api_key="bad-key-format")
except VeldrixAuthError as e:
    print(e)  # Includes exact fix instructions

# Configuration errors — caught at GuardConfig construction time
try:
    cfg = GuardConfig(background=True, block_on_verdict=["BLOCK"])
except VeldrixConfigError as e:
    print(e)  # "block_on_verdict has no effect when background=True — set background=False"

# Runtime errors (sync blocking mode — background=False)
try:
    response = chat(messages)
except VeldrixBlockError:
    return "I can't help with that."           # verdict matched block_on_verdict
except VeldrixRateLimitError:
    return cached_response                     # queue saturated (background=False)
except VeldrixServiceUnavailableError:
    return pass_through_without_trust()        # circuit breaker open
except VeldrixTimeoutError:
    pass                                       # evaluation timed out
except VeldrixAPIError as e:
    print(e.status_code)                       # HTTP status from the VeldrixAI API
except VeldrixError as e:
    print(e)                                   # catch-all base class

# In background mode (the default), NO exceptions are raised.
# Failures silently produce verdict=UNKNOWN, is_degraded=True.
# Check veldrix.stats() for counters.`;

const CODE_STATS = `veldrix = Veldrix.from_env()

# Live SDK telemetry — check anytime
stats = veldrix.stats()
print(stats)
# {
#   "queue_depth":           0,    # current background queue size
#   "queue_dropped_total":   0,    # evaluations dropped due to overflow
#   "rate_limited_total":    0,    # times token bucket fired
#   "breaker_state":        "CLOSED",   # CLOSED | OPEN | HALF_OPEN
#   "breaker_trips_total":   0,    # number of circuit breaker trips
# }

# Production monitoring pattern
import logging
logger = logging.getLogger("myapp")

def check_veldrix_health():
    s = veldrix.stats()
    if s["breaker_state"] == "OPEN":
        logger.warning("VeldrixAI circuit breaker open — evaluations paused")
    if s["queue_dropped_total"] > 0:
        logger.warning("VeldrixAI dropped %d evaluations", s["queue_dropped_total"])`;

const CODE_ENV_VARS = `# Core
VELDRIX_API_KEY=vx-live-...             # required
VELDRIX_BASE_URL=https://api.veldrixai.ca  # optional override

# Resilience tuning (all optional — defaults shown)
VELDRIX_RATE_LIMIT_RPS=100              # max evaluations per second
VELDRIX_RATE_LIMIT_BURST=200            # burst capacity
VELDRIX_QUEUE_MAX_SIZE=10000            # background queue depth
VELDRIX_QUEUE_OVERFLOW_POLICY=drop_oldest  # drop_oldest | raise`;

// ── Main component ────────────────────────────────────────────────────────────

type GuardTab = "openai" | "async" | "litellm" | "langchain";

export default function SDKPage() {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [guardTab, setGuardTab] = useState<GuardTab>("openai");
  const [openFaq,  setOpenFaq]  = useState<number | null>(null);

  function copy(text: string, id: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2200);
    });
  }

  const cb = (id: string) => ({ id, copiedId, onCopy: copy });

  const guardTabs: { key: GuardTab; label: string; code: string }[] = [
    { key: "openai",   label: "OpenAI",   code: CODE_GUARD_OPENAI   },
    { key: "async",    label: "Async",    code: CODE_GUARD_ASYNC    },
    { key: "litellm",  label: "LiteLLM",  code: CODE_GUARD_LITELLM  },
    { key: "langchain",label: "LangChain",code: CODE_GUARD_LANGCHAIN },
  ];

  const faqs = [
    {
      q: "What Python versions are supported?",
      a: "Python 3.10, 3.11, and 3.12. The SDK uses modern typing syntax that requires 3.10+.",
    },
    {
      q: "Does @veldrix.guard add latency to my LLM calls?",
      a: "No. With background=True (the default), the evaluation is dispatched asynchronously after your LLM returns. Your response path is never delayed. The evaluation appears in the dashboard within ~200–800 ms.",
    },
    {
      q: "What happens if VeldrixAI is down or times out?",
      a: "In background mode (default), failures are silent. The LLM response is returned normally. response.trust.is_degraded will be True and verdict will be UNKNOWN. Your application never crashes due to a VeldrixAI outage. In blocking mode (background=False), VeldrixTimeoutError or VeldrixServiceUnavailableError is raised so you can handle it explicitly.",
    },
    {
      q: "What are the SDK's runtime dependencies?",
      a: "httpx >= 0.27 and pydantic >= 2.0. Provider extras (openai, anthropic, etc.) are optional — install only what you need.",
    },
    {
      q: "What does block_on_verdict require?",
      a: "background=False. In background mode (default) the trust result is always PENDING at the time the LLM response is returned, so blocking can never fire. The SDK raises VeldrixConfigError immediately at GuardConfig construction if you combine background=True with block_on_verdict — so you catch the misconfiguration at startup, not silently in production.",
    },
    {
      q: "How do I use VeldrixAI with Anthropic Claude?",
      a: "Use enable_global_intercept(veldrix) at startup — one line patches httpx so every Anthropic request is automatically captured. No per-call changes needed. For decorator-style with manual evaluation, call veldrix.evaluate_sync(prompt, response) after getting the Anthropic response.",
    },
    {
      q: "Is there a Node.js / TypeScript SDK?",
      a: "The Node.js SDK is in active development. This page will be updated when it ships. In the meantime, Node.js services can hit the REST API directly — see the API reference at docs.veldrixai.ca.",
    },
    {
      q: "Where do I get an API key?",
      a: "Generate one from the API Keys page in this dashboard. Keys follow the format vx-live-... for production and vx-test-... for testing environments.",
    },
  ];

  return (
    <div className="vx-content" style={{ maxWidth: 920 }}>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div style={{ background: "linear-gradient(135deg, rgba(45,74,94,0.12), rgba(170,184,192,0.05))", border: "1px solid rgba(45,74,94,0.2)", borderRadius: 20, padding: "2.5rem", marginBottom: "2rem" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "0.75rem" }}>
              <h1 style={{ fontFamily: "Syne, sans-serif", fontWeight: 800, fontSize: "1.9rem", color: "#e7ecef", margin: 0 }}>
                VeldrixAI Python SDK
              </h1>
              <span style={{ background: "rgba(111,169,143,0.12)", border: "1px solid rgba(111,169,143,0.25)", color: "#6fa98f", fontFamily: "JetBrains Mono, monospace", fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20 }}>
                v{VERSION}
              </span>
            </div>
            <p style={{ fontFamily: "DM Sans, sans-serif", fontSize: "1rem", color: "rgba(231,236,239,0.5)", maxWidth: 560, lineHeight: 1.65, margin: "0 0 1.25rem" }}>
              Five-pillar trust evaluation — safety, hallucination, bias, prompt security, compliance — wired around your AI agent with a single decorator. Production-ready, zero-latency, strongly typed.
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="vx-btn vx-btn-primary" onClick={() => copy(INSTALL_CMD, "hero-install")} style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 13 }}>
                {copiedId === "hero-install" ? "✓ Copied!" : "$ pip install veldrixai"}
              </button>
              <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="vx-btn vx-btn-secondary">GitHub</a>
              <a href={PYPI_URL}   target="_blank" rel="noopener noreferrer" className="vx-btn vx-btn-secondary">PyPI</a>
              <a href={DOCS_URL}   target="_blank" rel="noopener noreferrer" className="vx-btn vx-btn-secondary">Full Docs ↗</a>
            </div>
          </div>
          <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "14px 20px", minWidth: 220 }}>
            {[
              { k: "Package",  v: "veldrixai"    },
              { k: "Version",  v: VERSION        },
              { k: "Python",   v: "3.10 – 3.12"  },
              { k: "Requires", v: "httpx, pydantic" },
              { k: "License",  v: "MIT"          },
            ].map(({ k, v }) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: 12, color: "rgba(231,236,239,0.35)" }}>{k}</span>
                <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: "rgba(231,236,239,0.65)" }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Installation ─────────────────────────────────────────────────── */}
      <Section title="Installation" id="installation">
        <CodeBlock lang="shell" code={CODE_INSTALL} {...cb("install")} />
        <InfoBox type="info">
          Provider extras are optional. The core SDK only needs <code style={{ color: "#abc8bd" }}>httpx</code> and <code style={{ color: "#abc8bd" }}>pydantic</code>. Install extras only for the providers you use.
        </InfoBox>
      </Section>

      {/* ── Authentication ────────────────────────────────────────────────── */}
      <Section title="Authentication" id="authentication">
        <p style={{ fontFamily: "DM Sans, sans-serif", fontSize: 13.5, color: "rgba(231,236,239,0.5)", marginBottom: "1rem", lineHeight: 1.6 }}>
          API keys are tied to your account and must start with <code style={{ color: "#c5cfd5" }}>vx-live-</code> (production) or <code style={{ color: "#c5cfd5" }}>vx-test-</code> (testing). Generate keys from the <a href="/dashboard/api-keys" style={{ color: "#2d4a5e" }}>API Keys</a> page.
        </p>
        <SubSection title="Environment variable (recommended)">
          <CodeBlock lang="shell" code={CODE_ENV} {...cb("env")} />
        </SubSection>
        <SubSection title="Initialising the client">
          <CodeBlock lang="python" code={CODE_INIT} {...cb("init")} />
        </SubSection>
        <InfoBox type="warn">
          Never commit API keys to source control. Use environment variables or a secrets manager. The SDK logs a masked hint (<code>vx-live-...xxxx</code>) — the full key never appears in logs.
        </InfoBox>
      </Section>

      {/* ── @guard Decorator ─────────────────────────────────────────────── */}
      <Section title="@veldrix.guard — Decorator Pattern" id="guard">
        <p style={{ fontFamily: "DM Sans, sans-serif", fontSize: 13.5, color: "rgba(231,236,239,0.5)", marginBottom: "1rem", lineHeight: 1.6 }}>
          The recommended integration. Wrap your LLM call function with <code style={{ color: "#c5cfd5" }}>@veldrix.guard</code> — every call is automatically evaluated in the background. Fully transparent: your existing response-handling code needs zero changes.
        </p>

        {/* Tab bar */}
        <div style={{ display: "flex", gap: 4, marginBottom: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: 4, width: "fit-content" }}>
          {guardTabs.map(t => (
            <button
              key={t.key}
              onClick={() => setGuardTab(t.key)}
              style={{
                padding: "7px 18px",
                borderRadius: 9,
                border: "none",
                fontFamily: "DM Sans, sans-serif",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                background: guardTab === t.key ? "rgba(45,74,94,0.2)" : "transparent",
                color: guardTab === t.key ? "#c5cfd5" : "rgba(231,236,239,0.4)",
                transition: "all 0.15s",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {guardTabs.map(t => guardTab === t.key && (
          <CodeBlock key={t.key} lang="python" code={t.code} {...cb(`guard-${t.key}`)} />
        ))}

        <div style={{ marginTop: "1.5rem" }}>
          <SubSection title="With blocking enforcement">
            <InfoBox type="info">
              Set <code style={{ color: "#c5cfd5" }}>background=False</code> when you need to block the response before returning it to the caller. In the default <code>background=True</code> mode, evaluation runs after the LLM returns so it adds zero latency.
            </InfoBox>
            <CodeBlock lang="python" code={CODE_BLOCKING} {...cb("blocking")} />
          </SubSection>
        </div>
      </Section>

      {/* ── Trust Result ─────────────────────────────────────────────────── */}
      <Section title="Reading the Trust Result" id="trust-result">
        <p style={{ fontFamily: "DM Sans, sans-serif", fontSize: 13.5, color: "rgba(231,236,239,0.5)", marginBottom: "1rem", lineHeight: 1.6 }}>
          Every guarded response has a <code style={{ color: "#c5cfd5" }}>.trust</code> property of type <code style={{ color: "#c5cfd5" }}>TrustResult</code>. All original response attributes are fully preserved — Veldrix is additive only.
        </p>
        <CodeBlock lang="python" code={CODE_TRUST_RESULT} {...cb("trust-result")} maxH={420} />

        <div style={{ marginTop: "1.25rem" }}>
          <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase", color: "rgba(231,236,239,0.25)", marginBottom: 8 }}>
            VERDICT REFERENCE
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 8 }}>
            {[
              { v: "ALLOW",   c: "#6fa98f", desc: "All pillars passed — safe to use"                     },
              { v: "WARN",    c: "#c2a06a", desc: "Borderline scores — consider review"                  },
              { v: "REVIEW",  c: "#aab8c0", desc: "One or more pillars borderline — escalate"            },
              { v: "BLOCK",   c: "#be7468", desc: "High-risk content — must not be used"                 },
              { v: "PENDING", c: "#2d4a5e", desc: "Background eval in-flight (background=True mode)"     },
              { v: "UNKNOWN", c: "rgba(231,236,239,0.25)", desc: "Evaluation failed silently (degraded)" },
            ].map(({ v, c, desc }) => (
              <div key={v} style={{ background: "rgba(255,255,255,0.025)", border: `1px solid ${c}25`, borderLeft: `3px solid ${c}`, borderRadius: "0 10px 10px 0", padding: "10px 14px" }}>
                <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, fontWeight: 700, color: c, marginBottom: 4 }}>{v}</div>
                <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 12, color: "rgba(231,236,239,0.4)" }}>{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ── Global Intercept ─────────────────────────────────────────────── */}
      <Section title="Global HTTP Intercept — Zero Code Changes" id="global-intercept">
        <p style={{ fontFamily: "DM Sans, sans-serif", fontSize: 13.5, color: "rgba(231,236,239,0.5)", marginBottom: "1rem", lineHeight: 1.6 }}>
          Call <code style={{ color: "#c5cfd5" }}>enable_global_intercept(veldrix)</code> once at startup. The SDK patches <code>httpx</code> and <code>requests</code> globally so every request to any known AI endpoint — OpenAI, Anthropic, Google, Mistral, Cohere, AWS Bedrock, Ollama, HuggingFace, and more — is automatically captured without touching any LLM call site.
        </p>
        <CodeBlock lang="python" code={CODE_GLOBAL_INTERCEPT} {...cb("global-intercept")} />
      </Section>

      {/* ── FastAPI Middleware ────────────────────────────────────────────── */}
      <Section title="FastAPI / ASGI Middleware" id="fastapi">
        <p style={{ fontFamily: "DM Sans, sans-serif", fontSize: 13.5, color: "rgba(231,236,239,0.5)", marginBottom: "1rem", lineHeight: 1.6 }}>
          For services where you own the API server. <code style={{ color: "#c5cfd5" }}>VeldrixMiddleware</code> intercepts request and response bodies, extracts prompt+response pairs, and evaluates them in the background — completely transparent to your endpoints.
        </p>
        <CodeBlock lang="python" code={CODE_FASTAPI} {...cb("fastapi")} />
      </Section>

      {/* ── Flask ────────────────────────────────────────────────────────── */}
      <Section title="Flask Middleware" id="flask">
        <CodeBlock lang="python" code={CODE_FLASK} {...cb("flask")} />
        <InfoBox type="tip">
          <code>init_flask()</code> uses a bounded ThreadPoolExecutor (max 32 workers) — it never spawns unbounded OS threads. All background evaluations run through this pool, applying automatic backpressure under high load.
        </InfoBox>
      </Section>

      {/* ── Manual Evaluation ────────────────────────────────────────────── */}
      <Section title="Manual Evaluation" id="manual">
        <p style={{ fontFamily: "DM Sans, sans-serif", fontSize: 13.5, color: "rgba(231,236,239,0.5)", marginBottom: "1rem", lineHeight: 1.6 }}>
          Use when you already have both the prompt and response — for re-evaluating stored content, batch processing, testing, or frameworks where the decorator doesn&apos;t fit.
        </p>
        <SubSection title="Synchronous">
          <CodeBlock lang="python" code={CODE_MANUAL_SYNC} {...cb("manual-sync")} />
        </SubSection>
        <SubSection title="Asynchronous">
          <CodeBlock lang="python" code={CODE_MANUAL_ASYNC} {...cb("manual-async")} />
        </SubSection>
        <SubSection title="Context manager">
          <CodeBlock lang="python" code={CODE_CONTEXT_MANAGER} {...cb("ctx-mgr")} />
        </SubSection>
      </Section>

      {/* ── Audit Callbacks ──────────────────────────────────────────────── */}
      <Section title="Audit Callbacks — on_result" id="callbacks">
        <p style={{ fontFamily: "DM Sans, sans-serif", fontSize: 13.5, color: "rgba(231,236,239,0.5)", marginBottom: "1rem", lineHeight: 1.6 }}>
          Every integration point accepts an <code style={{ color: "#c5cfd5" }}>on_result</code> callback that fires after every evaluation — ideal for writing to your own audit store, triggering alerts, or emitting metrics. Runs in the background. Exceptions inside the callback are caught and logged, never propagated.
        </p>
        <CodeBlock lang="python" code={CODE_ON_RESULT} {...cb("on-result")} />
      </Section>

      {/* ── Metadata Tagging ─────────────────────────────────────────────── */}
      <Section title="Metadata Tagging" id="metadata">
        <p style={{ fontFamily: "DM Sans, sans-serif", fontSize: 13.5, color: "rgba(231,236,239,0.5)", marginBottom: "1rem", lineHeight: 1.6 }}>
          Tag every evaluation with tenant IDs, user IDs, session context, or any key-value pair. Metadata is stored with the evaluation and visible in the Audit Logs dashboard for filtering and attribution. Per-call metadata overrides client-level defaults.
        </p>
        <CodeBlock lang="python" code={CODE_METADATA} {...cb("metadata")} />
      </Section>

      {/* ── Error Handling ───────────────────────────────────────────────── */}
      <Section title="Error Handling" id="errors">
        <CodeBlock lang="python" code={CODE_ERRORS} {...cb("errors")} maxH={460} />
      </Section>

      {/* ── Production Config ────────────────────────────────────────────── */}
      <Section title="Production Configuration" id="config">
        <SubSection title="GuardConfig reference">
          <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "12px 16px", marginBottom: "1rem" }}>
            <div className="vx-doc-row vx-doc-row-a vx-doc-head" style={{ paddingBottom: 8, marginBottom: 4, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
              <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase", color: "rgba(231,236,239,0.25)" }}>FIELD</span>
              <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase", color: "rgba(231,236,239,0.25)" }}>TYPE</span>
              <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase", color: "rgba(231,236,239,0.25)" }}>DEFAULT / DESCRIPTION</span>
            </div>
            <PropRow name="background"       type="bool"      dflt="True"       desc="Evaluate after LLM returns — no added latency. Set False to block on result." />
            <PropRow name="block_on_verdict" type="list[str]" dflt="[]"         desc='Verdicts that raise VeldrixBlockError. Requires background=False. e.g. ["BLOCK"]' />
            <PropRow name="timeout_ms"       type="int"       dflt="10_000"     desc="Max milliseconds to wait for evaluation (background=False only)." />
            <PropRow name="on_block"         type="Callable"  dflt="None"       desc="Called with TrustResult when block fires. Runs before the exception is raised." />
            <PropRow name="include_prompt"   type="bool"      dflt="True"       desc="Whether to send the prompt to VeldrixAI. Set False for highly sensitive prompts." />
            <PropRow name="metadata"         type="dict"      dflt="{}"         desc="Key-value pairs attached to this evaluation. Visible in Audit Logs." />
          </div>
        </SubSection>

        <SubSection title="Veldrix() constructor — advanced options">
          <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "12px 16px", marginBottom: "1rem" }}>
            <div className="vx-doc-row vx-doc-row-b vx-doc-head" style={{ paddingBottom: 8, marginBottom: 4, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
              <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase", color: "rgba(231,236,239,0.25)" }}>PARAM</span>
              <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase", color: "rgba(231,236,239,0.25)" }}>DEFAULT</span>
              <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase", color: "rgba(231,236,239,0.25)" }}>DESCRIPTION</span>
            </div>
            {[
              { n: "api_key",                        d: "required",     desc: "API key. Must start with vx-live- or vx-test-." },
              { n: "base_url",                       d: "api.veldrixai.ca", desc: "Override the API base URL (for self-hosted or staging)." },
              { n: "timeout_ms",                     d: "10_000",       desc: "Default timeout in milliseconds for blocking calls." },
              { n: "background",                     d: "True",         desc: "Global default for all @guard calls." },
              { n: "rate_limit_rps",                 d: "100.0",        desc: "Client-side token bucket rate limit (requests per second)." },
              { n: "rate_limit_burst",               d: "200.0",        desc: "Burst capacity above rate_limit_rps." },
              { n: "queue_max_size",                 d: "10_000",       desc: "Maximum background queue depth before dropping." },
              { n: "queue_overflow_policy",          d: "drop_oldest",  desc: "drop_oldest or raise when queue is full." },
              { n: "client_breaker_threshold",       d: "10",           desc: "Consecutive failures before circuit breaker opens." },
              { n: "client_breaker_recovery_seconds",d: "30.0",         desc: "Seconds before breaker moves from OPEN to HALF_OPEN." },
            ].map(r => (
              <div key={r.n} className="vx-doc-row vx-doc-row-b" style={{ padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <code style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11.5, color: "#c5cfd5" }}>{r.n}</code>
                <code style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#abc8bd" }}>{r.d}</code>
                <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: 12.5, color: "rgba(231,236,239,0.45)" }}>{r.desc}</span>
              </div>
            ))}
          </div>
        </SubSection>

        <SubSection title="SDK stats & observability">
          <CodeBlock lang="python" code={CODE_STATS} {...cb("stats")} />
        </SubSection>

        <SubSection title="Environment variables">
          <CodeBlock lang="shell" code={CODE_ENV_VARS} {...cb("env-vars")} />
        </SubSection>
      </Section>

      {/* ── Supported Providers ──────────────────────────────────────────── */}
      <Section title="Supported Providers" id="providers">
        <p style={{ fontFamily: "DM Sans, sans-serif", fontSize: 13.5, color: "rgba(231,236,239,0.5)", marginBottom: "1.25rem", lineHeight: 1.6 }}>
          The SDK auto-detects provider from the LLM response shape. All providers below work out of the box with <code style={{ color: "#c5cfd5" }}>@veldrix.guard</code> and <code style={{ color: "#c5cfd5" }}>enable_global_intercept()</code>.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8 }}>
          {[
            "OpenAI",       "Anthropic Claude",  "Google Gemini",   "LiteLLM",
            "LangChain",    "AWS Bedrock",        "Ollama",          "HuggingFace TGI",
            "Mistral",      "Cohere",             "DeepSeek",        "Qwen",
            "Together AI",  "Fireworks AI",       "Groq",            "Any httpx/requests",
          ].map(p => (
            <div key={p} style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: "10px 14px", fontFamily: "DM Sans, sans-serif", fontSize: 12.5, color: "rgba(231,236,239,0.55)", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#6fa98f", flexShrink: 0 }} />
              {p}
            </div>
          ))}
        </div>
      </Section>

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      <Section title="FAQ" id="faq">
        {faqs.map((faq, idx) => (
          <div key={idx} style={{ border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, marginBottom: "0.5rem", overflow: "hidden" }}>
            <button
              onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem 1.25rem", background: "rgba(255,255,255,0.025)", cursor: "pointer", fontSize: "0.88rem", fontWeight: 600, fontFamily: "DM Sans, sans-serif", color: "rgba(231,236,239,0.75)", border: "none", width: "100%", textAlign: "left", borderBottom: openFaq === idx ? "1px solid rgba(255,255,255,0.07)" : "none" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.025)")}
            >
              <span>{faq.q}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: openFaq === idx ? "rotate(180deg)" : "none", transition: "transform 200ms", flexShrink: 0, color: "rgba(231,236,239,0.3)" }}>
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
            {openFaq === idx && (
              <div style={{ padding: "1rem 1.25rem", fontFamily: "DM Sans, sans-serif", fontSize: "0.85rem", color: "rgba(231,236,239,0.5)", lineHeight: 1.7, background: "rgba(255,255,255,0.015)" }}>
                {faq.a}
              </div>
            )}
          </div>
        ))}
      </Section>
    </div>
  );
}
