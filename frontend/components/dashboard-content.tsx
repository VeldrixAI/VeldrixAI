"use client";

import { FormEvent, useState } from "react";

type TrustResponse = {
  data: {
    final_score: {
      value: number;
      confidence: number;
      risk_level?: string;
    };
    pillar_results: Record<
      string,
      {
        metadata: { name: string; weight: number };
        score?: { value: number };
        flags: string[];
        status: string;
      }
    >;
  };
};

export function DashboardContent() {
  const [prompt, setPrompt] = useState("");
  const [response, setResponse] = useState("");
  const [model, setModel] = useState("gpt-4");
  const [provider, setProvider] = useState("openai");
  const [trustResult, setTrustResult] = useState<TrustResponse["data"] | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [error, setError] = useState("");

  async function evaluateTrust(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEvaluating(true);
    setError("");
    try {
      const result = await fetch("/api/trust/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, response, model, provider })
      });
      const payload = await result.json();
      if (!result.ok) {
        throw new Error(payload.error || payload.detail || "Evaluation failed");
      }
      setTrustResult(payload.data);
    } catch (trustError) {
      setError(trustError instanceof Error ? trustError.message : "Evaluation failed");
    } finally {
      setEvaluating(false);
    }
  }

  return (
    <div className="shell dashboard-content">
      <div className="page-header">
        <h1>AI Trust Evaluation</h1>
        <p>Test your AI responses against all five trust pillars in real-time</p>
      </div>

      {error && <div className="error">{error}</div>}

      <form onSubmit={evaluateTrust} className="evaluation-form">
        <div className="form-row">
          <div className="form-group">
            <label>
              <span>User Prompt</span>
              <textarea
                required
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Enter the user's input prompt..."
                rows={6}
              />
            </label>
          </div>

          <div className="form-group">
            <label>
              <span>AI Response</span>
              <textarea
                required
                value={response}
                onChange={(e) => setResponse(e.target.value)}
                placeholder="Enter the AI model's response..."
                rows={6}
              />
            </label>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>
              <span>Model</span>
              <input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="e.g., gpt-4"
              />
            </label>
          </div>

          <div className="form-group">
            <label>
              <span>Provider</span>
              <input
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                placeholder="e.g., openai"
              />
            </label>
          </div>
        </div>

        <button className="solid-btn" type="submit" disabled={evaluating}>
          {evaluating ? "Evaluating..." : "Run Trust Evaluation"}
        </button>
      </form>

      {trustResult && (
        <div className="results-section">
          <h2>Evaluation Results</h2>
          
          <div className="results-summary">
            <div className="result-metric">
              <span className="metric-label">Final Score</span>
              <span className="metric-value">{trustResult.final_score.value.toFixed(2)}</span>
            </div>
            <div className="result-metric">
              <span className="metric-label">Confidence</span>
              <span className="metric-value">{(trustResult.final_score.confidence * 100).toFixed(0)}%</span>
            </div>
            <div className="result-metric">
              <span className="metric-label">Risk Level</span>
              <span className={`metric-value risk-${trustResult.final_score.risk_level || 'unknown'}`}>
                {trustResult.final_score.risk_level?.toUpperCase() || "UNKNOWN"}
              </span>
            </div>
          </div>

          <h3>Pillar Breakdown</h3>
          <div className="pillars-grid">
            {Object.entries(trustResult.pillar_results).map(([pillarId, result]) => (
              <div className="pillar-card" key={pillarId}>
                <h4>{result.metadata?.name ?? pillarId}</h4>
                <div className="pillar-details">
                  <p><span>Weight:</span> {result.metadata?.weight ?? 0}%</p>
                  <p><span>Status:</span> <strong className={`status-${result.status}`}>{result.status.toUpperCase()}</strong></p>
                  <p><span>Score:</span> {result.score?.value?.toFixed(2) ?? "N/A"}</p>
                  {result.flags && result.flags.length > 0 && (
                    <p className="flags">{result.flags.join(", ")}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
