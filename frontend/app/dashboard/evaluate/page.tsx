"use client";

import { FormEvent, useState, useRef, useEffect } from "react";

const PROVIDERS: Record<string, string[]> = {
  OpenAI: ["gpt-5", "gpt-5.2", "gpt-5.4", "gpt-5-mini", "gpt-4.1", "gpt-4.1-mini", "gpt-4.1-nano", "o3", "o4-mini", "gpt-4o", "gpt-4o-mini"],
  Anthropic: ["claude-sonnet-5", "claude-opus-4.5", "claude-opus-4", "claude-sonnet-4", "claude-haiku-4.5", "claude-3.7-sonnet"],
  "Google DeepMind": ["gemini-3", "gemini-3-flash", "gemini-3-flash-lite", "gemini-2.0-pro", "gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"],
  Meta: ["llama-4-maverick", "llama-4-scout", "llama-4-behemoth", "llama-3.3-70b", "llama-3.2-11b-vision", "llama-3.2-90b-vision", "llama-3.1-405b"],
  "Mistral AI": ["mistral-large", "mistral-medium", "mistral-small", "codestral", "pixtral-large", "ministral-8b", "ministral-3b"],
  DeepSeek: ["deepseek-v3", "deepseek-r1", "deepseek-r1-distill-llama", "deepseek-r1-distill-qwen", "deepseek-v2.5"],
  xAI: ["grok-3", "grok-3-mini", "grok-2", "grok-2-vision"],
  "Amazon AWS": ["nova-premier", "nova-pro", "nova-lite", "nova-micro"],
  Cohere: ["command-a", "command-r-plus", "command-r", "embed-v4", "embed-v3"],
  "Alibaba (Qwen)": ["qwen-max", "qwen-plus", "qwen-2.5-72b", "qwen-2.5-32b", "qwen-2.5-14b", "qwq-32b"],
  NVIDIA: ["nemotron-ultra", "nemotron-super", "nemotron-4"],
  Microsoft: ["phi-4", "phi-4-mini", "phi-3.5-moe", "phi-3.5-mini"],
};

function Chevron({ open }: { open: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ transition: "transform 150ms", transform: open ? "rotate(180deg)" : "rotate(0)" }}>
      <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function VxSelect({ label, value, options, onChange, grouped }: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  grouped?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return (
    <div>
      <label className="vx-label">{label}</label>
      <div ref={ref} style={{ position: "relative" }}>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          style={{
            width: "100%",
            padding: "0.75rem 1rem",
            background: "#fff",
            border: open ? "1px solid var(--vx-violet)" : "1px solid rgba(124,58,237,0.15)",
            borderRadius: "var(--vx-radius-sm)",
            color: "var(--vx-text)",
            fontFamily: "var(--vx-font-body)",
            fontSize: "0.875rem",
            textAlign: "left",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            transition: "all 150ms",
            boxShadow: open ? "0 0 0 3px rgba(124,58,237,0.15)" : "none",
          }}
        >
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</span>
          <Chevron open={open} />
        </button>

        {open && (
          <div style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            zIndex: 200,
            background: "#1a1a2e",
            border: "1px solid rgba(124,58,237,0.25)",
            borderRadius: "var(--vx-radius-sm)",
            backdropFilter: "blur(24px)",
            boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
            maxHeight: "260px",
            overflowY: "auto",
            padding: "4px",
          }}>
            {options.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => { onChange(opt); setOpen(false); }}
                style={{
                  display: "block",
                  width: "100%",
                  padding: "0.5rem 0.75rem",
                  background: opt === value ? "rgba(124,58,237,0.15)" : "transparent",
                  border: "none",
                  borderRadius: "6px",
                  color: opt === value ? "var(--vx-violet)" : "var(--vx-text)",
                  fontFamily: "var(--vx-font-body)",
                  fontSize: "0.85rem",
                  fontWeight: opt === value ? 600 : 400,
                  textAlign: "left",
                  cursor: "pointer",
                  transition: "background 100ms",
                }}
                onMouseEnter={(e) => { if (opt !== value) e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
                onMouseLeave={(e) => { if (opt !== value) e.currentTarget.style.background = "transparent"; }}
              >
                {opt}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

type TrustResponse = {
  data: {
    final_score: { value: number; confidence: number; risk_level?: string };
    pillar_results: Record<string, {
      metadata: { name: string; weight: number };
      score?: { value: number };
      flags: string[];
      status: string;
    }>;
    metadata?: { cache_hit?: boolean; request_id?: string };
  };
};

export default function EvaluatePage() {
  const [prompt, setPrompt] = useState("");
  const [response, setResponse] = useState("");
  const [provider, setProvider] = useState("OpenAI");
  const [model, setModel] = useState("gpt-4o");
  const [trustResult, setTrustResult] = useState<TrustResponse["data"] | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [error, setError] = useState("");

  function handleProviderChange(p: string) {
    setProvider(p);
    setModel(PROVIDERS[p][0]);
  }

  async function evaluateTrust(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEvaluating(true);
    setError("");
    try {
      const result = await fetch("/api/trust/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, response, model, provider }),
      });
      const payload = await result.json();
      if (!result.ok) throw new Error(payload.error || payload.detail || "Evaluation failed");
      setTrustResult(payload.data);

      // Log to audit trails
      fetch("/api/audit-trails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action_type: "trust_evaluation",
          entity_type: "evaluation",
          metadata: { prompt, response, model, provider, result: payload.data },
        }),
      }).catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Evaluation failed");
    } finally {
      setEvaluating(false);
    }
  }

  return (
    <div className="vx-content">
      <h1 className="vx-page-title">Trust Evaluation</h1>
      <p className="vx-page-desc">Test AI responses against all five trust pillars in real-time.</p>

      {error && <div className="vx-error">{error}</div>}

      <div className="vx-card vx-card-accent">
        <form onSubmit={evaluateTrust}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
            <div>
              <label className="vx-label">User Prompt</label>
              <textarea className="vx-input" required value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Enter the user's input prompt..." rows={5} style={{ minHeight: "120px", resize: "vertical" }} />
            </div>
            <div>
              <label className="vx-label">AI Response</label>
              <textarea className="vx-input" required value={response} onChange={(e) => setResponse(e.target.value)} placeholder="Enter the AI model's response..." rows={5} style={{ minHeight: "120px", resize: "vertical" }} />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.5rem" }}>
            <VxSelect label="Provider" value={provider} options={Object.keys(PROVIDERS)} onChange={handleProviderChange} />
            <VxSelect label="Model" value={model} options={PROVIDERS[provider]} onChange={setModel} />
          </div>
          <button className="vx-btn vx-btn-primary" type="submit" disabled={evaluating}>
            {evaluating ? "Evaluating..." : "Run Evaluation"}
          </button>
        </form>
      </div>

      {trustResult && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginTop: "2rem", marginBottom: "1.5rem" }}>
            <h2 style={{ fontFamily: "var(--vx-font-display)", fontWeight: 800, fontSize: "1.25rem", color: "var(--vx-text)", margin: 0 }}>
              Results
            </h2>
            {trustResult.metadata?.cache_hit && (
              <span className="vx-badge vx-badge-success">Cache Hit</span>
            )}
            {trustResult.metadata?.request_id && (
              <code style={{ fontSize: "0.72rem", color: "var(--vx-text-muted)", fontFamily: "monospace", background: "var(--vx-surface)", padding: "0.25rem 0.5rem", borderRadius: "4px", border: "1px solid var(--vx-border)" }}>
                {trustResult.metadata.request_id.slice(0, 8)}
              </code>
            )}
          </div>
          <div className="vx-kpi-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
            <div className="vx-kpi-card">
              <div className="vx-kpi-label">Final Score</div>
              <div className="vx-kpi-value" style={{ color: "var(--vx-violet)" }}>{trustResult.final_score.value.toFixed(2)}</div>
            </div>
            <div className="vx-kpi-card">
              <div className="vx-kpi-label">Confidence</div>
              <div className="vx-kpi-value" style={{ color: "var(--vx-cyan)" }}>{(trustResult.final_score.confidence * 100).toFixed(0)}%</div>
            </div>
            <div className="vx-kpi-card" style={{ borderLeftColor: trustResult.final_score.risk_level === "low" ? "var(--vx-emerald)" : trustResult.final_score.risk_level === "medium" ? "var(--vx-amber)" : "var(--vx-rose)" }}>
              <div className="vx-kpi-label">Risk Level</div>
              <div className="vx-kpi-value" style={{ color: trustResult.final_score.risk_level === "low" ? "var(--vx-emerald)" : trustResult.final_score.risk_level === "medium" ? "var(--vx-amber)" : "var(--vx-rose)" }}>
                {trustResult.final_score.risk_level?.toUpperCase() || "UNKNOWN"}
              </div>
            </div>
          </div>

          <h3 style={{ fontFamily: "var(--vx-font-display)", fontWeight: 800, fontSize: "1.1rem", color: "var(--vx-text)", marginTop: "2rem", marginBottom: "1rem" }}>Pillar Breakdown</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
            {Object.entries(trustResult.pillar_results).map(([pillarId, result]) => (
              <div className="vx-card" key={pillarId}>
                <h4 style={{ fontFamily: "var(--vx-font-display)", fontWeight: 800, fontSize: "0.95rem", marginBottom: "0.75rem", color: "var(--vx-text)" }}>{result.metadata?.name ?? pillarId}</h4>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.85rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--vx-text-muted)" }}>Weight</span>
                    <strong style={{ color: "var(--vx-text)" }}>{result.metadata?.weight ?? 0}%</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--vx-text-muted)" }}>Status</span>
                    <strong style={{ color: result.status === "passed" ? "var(--vx-emerald)" : "var(--vx-amber)" }}>{result.status.toUpperCase()}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--vx-text-muted)" }}>Score</span>
                    <strong style={{ color: "var(--vx-text)" }}>{result.score?.value?.toFixed(2) ?? "N/A"}</strong>
                  </div>
                </div>
                {result.flags && result.flags.length > 0 && (
                  <div style={{ marginTop: "0.75rem", padding: "0.5rem 0.75rem", background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: "8px", fontSize: "0.8rem", color: "var(--vx-amber)" }}>
                    {result.flags.join(", ")}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
