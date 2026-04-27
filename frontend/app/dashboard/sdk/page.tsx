"use client";

import { useState } from "react";

const PYTHON_VERSION = "0.2.0";
const PYTHON_INSTALL = "pip install veldrix-sdk";
const GITHUB_URL = "https://github.com/veldrixai/veldrix-sdk-python";

const codeExamples = [
  {
    title: "Basic Trust Evaluation",
    description: "Evaluate an AI-generated response for safety and governance using client.analyze().",
    code: `from veldrix_sdk import VeldrixClient

client = VeldrixClient(
    api_key="your-api-key",
    base_url="https://api.veldrix.ai",
)

result = client.analyze(
    prompt="What are the health benefits of exercise?",
    response="Regular exercise improves cardiovascular health...",
    model="gpt-4",
    provider="openai",
)

print(result.overall_score)   # e.g. 88.9
print(result.risk_level)      # e.g. "safe"
print(result.confidence)      # e.g. 1.0`,
  },
  {
    title: "Error Handling",
    description: "Handle authentication, validation, and connection errors cleanly.",
    code: `from veldrix_sdk import (
    VeldrixClient,
    AuthenticationError,
    ValidationError,
    ApiConnectionError,
    TimeoutError,
    VeldrixError,
)

client = VeldrixClient(api_key="your-api-key")

try:
    result = client.analyze(
        prompt="...",
        response="...",
        model="gpt-4",
    )
except AuthenticationError:
    print("Invalid API key")
except ValidationError as e:
    print(f"Validation failed: {e.errors}")
except TimeoutError:
    print("Request timed out")
except VeldrixError as e:
    print(f"Error: {e.message}")`,
  },
  {
    title: "Per-Pillar Results",
    description: "Inspect individual safety pillar scores from the evaluation response.",
    code: `result = client.analyze(
    prompt="...",
    response="...",
    model="gpt-4",
)

for pillar_id, pillar in result.pillar_results.items():
    score = f"{pillar.score.value:.1f}" if pillar.score else "N/A"
    print(f"[{pillar.name}] status={pillar.status} score={score}")

# Output:
# [Safety & Toxicity Analysis] status=success score=97.3
# [Hallucination & Factual Integrity] status=success score=73.6
# [Bias & Fairness Analysis] status=success score=91.4
# [Prompt Security & Injection Detection] status=success score=96.0
# [Compliance & Policy Enforcement] status=success score=89.9`,
  },
];

const faqs = [
  {
    q: "What Python versions are supported?",
    a: "Python 3.9, 3.10, 3.11, and 3.12. Python 3.14 is not yet supported due to missing prebuilt wheels for dependencies.",
  },
  {
    q: "What is the only runtime dependency?",
    a: "httpx >= 0.27. The SDK has no other runtime dependencies.",
  },
  {
    q: "Is there a Node.js SDK?",
    a: "The Node.js SDK is in development. It is not yet available. This page will be updated when it ships.",
  },
  {
    q: "How do I authenticate?",
    a: "Pass api_key= for production server-to-server use, or token= for JWT-based flows. Both are sent as Authorization: Bearer headers.",
  },
  {
    q: "Where can I get an API key?",
    a: "Generate one from the API Keys page in this dashboard.",
  },
];

export default function SDKPage() {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  function copy(text: string, id: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }

  return (
    <div className="vx-content">
      <div style={{
        background: "linear-gradient(135deg, rgba(124,58,237,0.1), rgba(6,182,212,0.05))",
        border: "1px solid var(--vx-border)",
        borderRadius: "var(--vx-radius)",
        padding: "2.5rem",
        marginBottom: "2rem"
      }}>
        <h1 style={{ fontFamily: "var(--vx-font-display)", fontWeight: 800, fontSize: "2rem", marginBottom: "0.75rem", color: "var(--vx-text)" }}>
          VeldrixAI Python SDK
        </h1>
        <p style={{ fontSize: "1rem", color: "var(--vx-text-muted)", marginBottom: "1.5rem", maxWidth: "600px", lineHeight: 1.6 }}>
          Integrate AI safety guardrails into your applications with a single method call.
          Production-ready, strongly typed, zero framework coupling.
        </p>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <button className="vx-btn vx-btn-primary" onClick={() => copy(PYTHON_INSTALL, "hero-install")}>
            {copiedId === "hero-install" ? "✓ Copied!" : "Copy Install Command"}
          </button>
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="vx-btn vx-btn-secondary">
            View on GitHub
          </a>
        </div>
      </div>

      <h2 style={{ fontFamily: "var(--vx-font-display)", fontWeight: 800, fontSize: "1.25rem", marginBottom: "1rem", color: "var(--vx-text)" }}>Installation</h2>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "2rem" }}>
        <div className="vx-card">
          <div style={{ fontWeight: 600, marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span>Python — v{PYTHON_VERSION}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", background: "#0f172a", border: "1px solid rgba(124,58,237,0.25)", borderRadius: "8px", padding: "0.5rem 0.75rem", fontFamily: "monospace", fontSize: "0.85rem", color: "#e2e8f0" }}>
            <span style={{ flex: 1 }}>{PYTHON_INSTALL}</span>
            <button
              onClick={() => copy(PYTHON_INSTALL, "install-python")}
              style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.7)", padding: "0.25rem 0.6rem", borderRadius: "5px", fontSize: "0.7rem", cursor: "pointer", transition: "color 150ms, background-color 150ms, border-color 150ms, box-shadow 150ms, transform 150ms, opacity 150ms" }}
            >
              {copiedId === "install-python" ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>
        <div className="vx-card" style={{ opacity: 0.6 }}>
          <div style={{ fontWeight: 600, marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span>Node.js</span>
            <span className="vx-badge vx-badge-warning" style={{ fontSize: "0.65rem" }}>Coming Soon</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", background: "#0f172a", border: "1px solid rgba(124,58,237,0.25)", borderRadius: "8px", padding: "0.5rem 0.75rem", fontFamily: "monospace", fontSize: "0.85rem", color: "#94a3b8" }}>
            npm install @veldrix/sdk
          </div>
        </div>
      </div>

      <h2 style={{ fontFamily: "var(--vx-font-display)", fontWeight: 800, fontSize: "1.25rem", marginBottom: "1rem", color: "var(--vx-text)" }}>Quickstart</h2>
      {codeExamples.map((ex, idx) => (
        <div key={idx} className="vx-card" style={{ marginBottom: "1.25rem" }}>
          <h3 style={{ fontFamily: "var(--vx-font-display)", fontWeight: 800, fontSize: "1rem", marginBottom: "0.5rem", color: "var(--vx-text)" }}>
            {ex.title}
          </h3>
          <p style={{ fontSize: "0.875rem", color: "var(--vx-text-muted)", marginBottom: "1rem", lineHeight: 1.6 }}>
            {ex.description}
          </p>
          <div style={{ background: "#1e1e2e", borderRadius: "var(--vx-radius)", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.5rem 1rem", background: "rgba(255,255,255,0.05)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
              <span style={{ fontSize: "0.7rem", fontWeight: 600, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Python</span>
              <button
                onClick={() => copy(ex.code, `ex-${idx}`)}
                style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", color: copiedId === `ex-${idx}` ? "#10B981" : "rgba(255,255,255,0.7)", padding: "0.25rem 0.6rem", borderRadius: "5px", fontSize: "0.7rem", cursor: "pointer", transition: "color 150ms, background-color 150ms, border-color 150ms, box-shadow 150ms, transform 150ms, opacity 150ms" }}
              >
                {copiedId === `ex-${idx}` ? "✓ Copied!" : "Copy"}
              </button>
            </div>
            <div style={{ padding: "1rem 1.15rem", overflowX: "auto" }}>
              <pre style={{ margin: 0, fontFamily: "monospace", fontSize: "0.82rem", lineHeight: 1.6, color: "#cdd6f4" }}>
                <code>{ex.code}</code>
              </pre>
            </div>
          </div>
        </div>
      ))}

      <h2 style={{ fontFamily: "var(--vx-font-display)", fontWeight: 800, fontSize: "1.25rem", marginTop: "2rem", marginBottom: "1rem", color: "var(--vx-text)" }}>Authentication</h2>
      <div className="vx-card">
        <h3 style={{ fontFamily: "var(--vx-font-display)", fontWeight: 800, fontSize: "1rem", marginBottom: "1rem", color: "var(--vx-text)" }}>Setting Your API Key</h3>
        <p style={{ fontSize: "0.88rem", color: "var(--vx-text-muted)", marginBottom: "1rem", lineHeight: 1.6 }}>
          Never hard-code credentials. Use environment variables.
        </p>
        <div style={{ background: "#1e1e2e", borderRadius: "var(--vx-radius)", overflow: "hidden", marginBottom: "1rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.5rem 1rem", background: "rgba(255,255,255,0.05)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            <span style={{ fontSize: "0.7rem", fontWeight: 600, color: "rgba(255,255,255,0.5)", textTransform: "uppercase" }}>Shell</span>
            <button
              onClick={() => copy("export VELDRIX_API_KEY=your-api-key-here", "env")}
              style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", color: copiedId === "env" ? "#10B981" : "rgba(255,255,255,0.7)", padding: "0.25rem 0.6rem", borderRadius: "5px", fontSize: "0.7rem", cursor: "pointer" }}
            >
              {copiedId === "env" ? "✓ Copied!" : "Copy"}
            </button>
          </div>
          <div style={{ padding: "1rem 1.15rem" }}>
            <pre style={{ margin: 0, fontFamily: "monospace", fontSize: "0.82rem", color: "#cdd6f4" }}>
              <code>export VELDRIX_API_KEY=your-api-key-here</code>
            </pre>
          </div>
        </div>
        <div style={{ background: "#1e1e2e", borderRadius: "var(--vx-radius)", overflow: "hidden" }}>
          <div style={{ padding: "0.5rem 1rem", background: "rgba(255,255,255,0.05)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            <span style={{ fontSize: "0.7rem", fontWeight: 600, color: "rgba(255,255,255,0.5)", textTransform: "uppercase" }}>Python</span>
          </div>
          <div style={{ padding: "1rem 1.15rem" }}>
            <pre style={{ margin: 0, fontFamily: "monospace", fontSize: "0.82rem", lineHeight: 1.6, color: "#cdd6f4" }}>
              <code>{`import os\nfrom veldrix_sdk import VeldrixClient\n\nclient = VeldrixClient(api_key=os.environ["VELDRIX_API_KEY"])`}</code>
            </pre>
          </div>
        </div>
      </div>

      <h2 style={{ fontFamily: "var(--vx-font-display)", fontWeight: 800, fontSize: "1.25rem", marginTop: "2rem", marginBottom: "1rem", color: "var(--vx-text)" }}>SDK Version</h2>
      <div className="vx-card">
        {[
          { key: "Package", value: "veldrix-sdk" },
          { key: "Version", value: PYTHON_VERSION },
          { key: "Python", value: "3.9 – 3.12" },
          { key: "Dependencies", value: "httpx >= 0.27" },
          { key: "Source", value: <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" style={{ color: "var(--vx-violet)" }}>GitHub</a> },
        ].map((item, idx, arr) => (
          <div key={item.key} style={{ display: "flex", justifyContent: "space-between", padding: "0.75rem 0", borderBottom: idx < arr.length - 1 ? "1px solid var(--vx-divider)" : "none" }}>
            <span style={{ fontSize: "0.85rem", color: "var(--vx-text-muted)" }}>{item.key}</span>
            <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--vx-text)" }}>{item.value}</span>
          </div>
        ))}
        <div style={{ display: "flex", justifyContent: "space-between", padding: "0.75rem 0" }}>
          <span style={{ fontSize: "0.85rem", color: "var(--vx-text-muted)" }}>Node SDK</span>
          <span className="vx-badge vx-badge-warning">Coming Soon</span>
        </div>
      </div>

      <h2 style={{ fontFamily: "var(--vx-font-display)", fontWeight: 800, fontSize: "1.25rem", marginTop: "2rem", marginBottom: "1rem", color: "var(--vx-text)" }}>FAQ</h2>
      {faqs.map((faq, idx) => (
        <div key={idx} style={{ border: "1px solid var(--vx-border)", borderRadius: "var(--vx-radius)", marginBottom: "0.5rem", overflow: "hidden" }}>
          <button
            onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem 1.15rem", background: "var(--vx-card-bg)", cursor: "pointer", fontSize: "0.9rem", fontWeight: 600, color: "var(--vx-text-primary)", border: "none", width: "100%", textAlign: "left", transition: "background 150ms", borderBottom: openFaq === idx ? "1px solid var(--vx-divider)" : "none" }}
            onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
            onMouseLeave={(e) => e.currentTarget.style.background = "var(--vx-card-bg)"}
          >
            <span>{faq.q}</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: openFaq === idx ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 200ms" }}>
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
          {openFaq === idx && (
            <div style={{ padding: "0 1.15rem 1rem", fontSize: "0.85rem", color: "var(--vx-text-muted)", lineHeight: 1.6 }}>
              {faq.a}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
