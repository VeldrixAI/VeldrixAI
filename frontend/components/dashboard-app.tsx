"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";

type User = {
  id: string;
  email: string;
  role: string;
  is_active: boolean;
};

type ApiKey = {
  id: string;
  name?: string | null;
  is_active: boolean;
  created_at: string;
  last_used_at?: string | null;
};

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

export function DashboardApp() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [keyName, setKeyName] = useState("");
  const [newApiKey, setNewApiKey] = useState("");
  const [prompt, setPrompt] = useState("");
  const [response, setResponse] = useState("");
  const [model, setModel] = useState("gpt-4");
  const [provider, setProvider] = useState("openai");
  const [trustResult, setTrustResult] = useState<TrustResponse["data"] | null>(null);
  const [evaluating, setEvaluating] = useState(false);

  useEffect(() => {
    async function boot() {
      try {
        const meRes = await fetch("/api/auth/me");
        if (!meRes.ok) throw new Error("Unauthorized");
        const me = await meRes.json();
        setUser(me);

        const keyRes = await fetch("/api/api-keys");
        if (keyRes.ok) {
          const keyData = await keyRes.json();
          setApiKeys(keyData);
        }
      } catch (bootError) {
        setError(
          bootError instanceof Error ? bootError.message : "Failed to load dashboard"
        );
      } finally {
        setLoading(false);
      }
    }
    void boot();
  }, []);

  async function createKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await fetch("/api/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: keyName || null })
    });
    const payload = await result.json();
    if (!result.ok) {
      setError(payload.error || "Failed to create API key");
      return;
    }
    setNewApiKey(payload.api_key);
    setKeyName("");
    const refresh = await fetch("/api/api-keys");
    if (refresh.ok) {
      setApiKeys(await refresh.json());
    }
  }

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

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  if (loading) {
    return <main className="shell dashboard"><p>Loading dashboard...</p></main>;
  }

  if (!user) {
    return (
      <main className="shell dashboard">
        <p>Session expired. Please sign in again.</p>
        <Link className="solid-btn" href="/login">Go to login</Link>
      </main>
    );
  }

  return (
    <main className="shell dashboard">
      <header className="dash-top">
        <div>
          <h1>Trust Orchestration Dashboard</h1>
          <p className="muted">{user.email} • {user.role}</p>
        </div>
        <button className="ghost-btn" onClick={logout}>Sign Out</button>
      </header>

      {error ? <p className="error">{error}</p> : null}

      <section className="dash-grid">
        <article className="card">
          <h2>Evaluate AI Output</h2>
          <p className="muted" style={{ marginBottom: '1.5rem' }}>
            Test your AI responses against all five trust pillars in real-time.
          </p>
          <form onSubmit={evaluateTrust} className="stack">
            <label>
              <span>User Prompt</span>
              <textarea 
                required 
                value={prompt} 
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Enter the user's input prompt..."
              />
            </label>
            <label>
              <span>AI Response</span>
              <textarea 
                required 
                value={response} 
                onChange={(event) => setResponse(event.target.value)}
                placeholder="Enter the AI model's response..."
              />
            </label>
            <div className="inline-fields">
              <label>
                <span>Model</span>
                <input 
                  value={model} 
                  onChange={(event) => setModel(event.target.value)}
                  placeholder="e.g., gpt-4"
                />
              </label>
              <label>
                <span>Provider</span>
                <input 
                  value={provider} 
                  onChange={(event) => setProvider(event.target.value)}
                  placeholder="e.g., openai"
                />
              </label>
            </div>
            <button className="solid-btn" type="submit" disabled={evaluating}>
              {evaluating ? "Evaluating..." : "Run Trust Evaluation"}
            </button>
          </form>
        </article>

        <article className="card">
          <h2>API Key Management</h2>
          <p className="muted" style={{ marginBottom: '1.5rem' }}>
            Generate and manage API keys for programmatic access.
          </p>
          <form className="stack" onSubmit={createKey}>
            <label>
              <span>Key Name (Optional)</span>
              <input
                value={keyName}
                onChange={(event) => setKeyName(event.target.value)}
                placeholder="e.g., Production SDK"
              />
            </label>
            <button className="solid-btn" type="submit">+ Generate New Key</button>
          </form>
          {newApiKey ? (
            <div className="notice">
              <strong>New API Key Created</strong>
              <p style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>Copy this key now - it won't be shown again:</p>
              <code style={{ display: 'block', marginTop: '0.5rem', wordBreak: 'break-all' }}>{newApiKey}</code>
            </div>
          ) : null}
          {apiKeys.length > 0 ? (
            <ul className="list">
              {apiKeys.map((key) => (
                <li key={key.id}>
                  <div>
                    <strong>{key.name || "Unnamed Key"}</strong>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                      Created: {new Date(key.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <span style={{ 
                    padding: '0.25rem 0.75rem', 
                    borderRadius: '6px',
                    fontSize: '0.85rem',
                    background: key.is_active ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                    color: key.is_active ? 'var(--success)' : 'var(--error)'
                  }}>
                    {key.is_active ? "Active" : "Revoked"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted" style={{ marginTop: '1rem', textAlign: 'center' }}>
              No API keys yet. Generate your first key above.
            </p>
          )}
        </article>
      </section>

      {trustResult ? (
        <section className="card" style={{ marginTop: '2rem' }}>
          <h2>Evaluation Results</h2>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
            gap: '1rem',
            padding: '1.5rem',
            background: 'rgba(139, 92, 246, 0.1)',
            borderRadius: '12px',
            marginTop: '1rem',
            marginBottom: '2rem'
          }}>
            <div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Final Score</p>
              <p style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--accent-primary)' }}>
                {trustResult.final_score.value.toFixed(2)}
              </p>
            </div>
            <div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Confidence</p>
              <p style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--success)' }}>
                {(trustResult.final_score.confidence * 100).toFixed(0)}%
              </p>
            </div>
            <div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Risk Level</p>
              <p style={{ 
                fontSize: '1.5rem', 
                fontWeight: 'bold',
                color: trustResult.final_score.risk_level === 'low' ? 'var(--success)' : 
                       trustResult.final_score.risk_level === 'medium' ? 'var(--warning)' : 'var(--error)'
              }}>
                {trustResult.final_score.risk_level?.toUpperCase() || "UNKNOWN"}
              </p>
            </div>
          </div>
          
          <h3 style={{ marginBottom: '1rem' }}>Pillar Breakdown</h3>
          <div className="grid">
            {Object.entries(trustResult.pillar_results).map(([pillarId, result]) => (
              <article className="card" key={pillarId} style={{ background: 'rgba(255, 255, 255, 0.03)' }}>
                <h3 style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>
                  {result.metadata?.name ?? pillarId}
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <p style={{ fontSize: '0.9rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Weight:</span>{" "}
                    <strong>{result.metadata?.weight ?? 0}%</strong>
                  </p>
                  <p style={{ fontSize: '0.9rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Status:</span>{" "}
                    <strong style={{ color: result.status === 'passed' ? 'var(--success)' : 'var(--warning)' }}>
                      {result.status.toUpperCase()}
                    </strong>
                  </p>
                  <p style={{ fontSize: '0.9rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Score:</span>{" "}
                    <strong>{result.score?.value?.toFixed(2) ?? "N/A"}</strong>
                  </p>
                  {result.flags && result.flags.length > 0 && (
                    <p style={{ 
                      fontSize: '0.85rem', 
                      color: 'var(--warning)',
                      marginTop: '0.5rem',
                      padding: '0.5rem',
                      background: 'rgba(245, 158, 11, 0.1)',
                      borderRadius: '6px'
                    }}>
                      {result.flags.join(", ")}
                    </p>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
