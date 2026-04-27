"use client";

import { useEffect, useState } from "react";

type ApiKey = {
  id: string;
  name?: string | null;
  is_active: boolean;
  created_at: string;
  last_used_at?: string | null;
  key_prefix?: string;
};

function generateUniqueName(): string {
  const adjectives = ["Swift", "Bright", "Noble", "Cosmic", "Azure", "Golden", "Silver", "Crystal", "Quantum", "Stellar"];
  const nouns = ["Key", "Gate", "Portal", "Bridge", "Vault", "Shield", "Beacon", "Prism", "Core", "Node"];
  return `${adjectives[Math.floor(Math.random() * adjectives.length)]}_${nouns[Math.floor(Math.random() * nouns.length)]}`;
}

function formatRelativeTime(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHrs = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHrs / 24);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? "s" : ""} ago`;
  if (diffHrs < 24) return `${diffHrs} hr${diffHrs > 1 ? "s" : ""} ago`;
  return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
}

export default function ApiKeysPage() {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [govHealth, setGovHealth] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [newApiKey, setNewApiKey] = useState("");
  const [error, setError] = useState("");

  async function loadKeys() {
    setIsLoading(true);
    try {
      const res = await fetch("/api/api-keys");
      if (res.ok) setApiKeys(await res.json());
      else setError("Failed to load API keys");
    } catch {
      setError("Failed to load API keys");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadKeys();
    fetch("/api/analytics?path=sdk-stats&range=30d")
      .then((r) => r.json())
      .then((data) => {
        const score = data.avg_trust_score;
        setGovHealth(score != null ? Math.round(score) : null);
      })
      .catch(() => {});
  }, []);

  async function handleCreateKey() {
    const finalName = newKeyName.trim() || generateUniqueName();
    setIsCreating(true);
    try {
      const result = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: finalName }),
      });
      const payload = await result.json();
      if (!result.ok) throw new Error(payload.error || "Failed to create API key");
      if (payload.api_key) setNewApiKey(payload.api_key);
      setNewKeyName("");
      setShowCreateModal(false);
      await loadKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create key");
    } finally {
      setIsCreating(false);
    }
  }

  async function handleRevokeKey(keyId: string) {
    setRevokingId(keyId);
    try {
      const result = await fetch(`/api/api-keys/${keyId}`, { method: "DELETE" });
      if (!result.ok) throw new Error("Failed to revoke key");
      setApiKeys((prev) => prev.map((k) => (k.id === keyId ? { ...k, is_active: false } : k)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke key");
    } finally {
      setRevokingId(null);
      setConfirmRevokeId(null);
    }
  }

  const govOffset = govHealth !== null ? (691 * (1 - govHealth / 100)).toFixed(1) : "110";

  return (
    <div style={{ padding: "48px", minHeight: "100%", background: "#050810", position: "relative" }}>
      {/* Error banner */}
      {error && (
        <div
          style={{
            marginBottom: "16px",
            padding: "12px 16px",
            borderRadius: "10px",
            background: "rgba(244,63,94,0.1)",
            border: "1px solid rgba(244,63,94,0.2)",
            color: "#f43f5e",
            fontFamily: "DM Sans, sans-serif",
            fontSize: "14px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {error}
          <button
            onClick={() => setError("")}
            style={{ background: "none", border: "none", color: "#f43f5e", cursor: "pointer", fontSize: "18px", lineHeight: 1 }}
          >
            ×
          </button>
        </div>
      )}

      {/* Newly created key banner */}
      {newApiKey && (
        <div
          style={{
            marginBottom: "24px",
            padding: "20px 24px",
            borderRadius: "16px",
            background: "rgba(16,185,129,0.08)",
            border: "1px solid rgba(16,185,129,0.2)",
          }}
        >
          <div
            style={{
              fontFamily: "Syne, sans-serif",
              fontWeight: 700,
              fontSize: "14px",
              color: "#10b981",
              marginBottom: "12px",
            }}
          >
            Key Created Successfully — Copy it now, it won&apos;t be shown again
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <code
              style={{
                flex: 1,
                fontFamily: "JetBrains Mono, monospace",
                fontSize: "13px",
                color: "#f0f2ff",
                wordBreak: "break-all",
                background: "rgba(0,0,0,0.3)",
                padding: "10px 14px",
                borderRadius: "8px",
                display: "block",
              }}
            >
              {newApiKey}
            </code>
            <button
              onClick={() => navigator.clipboard.writeText(newApiKey)}
              style={{
                padding: "10px 16px",
                borderRadius: "8px",
                border: "1px solid rgba(16,185,129,0.3)",
                background: "rgba(16,185,129,0.1)",
                color: "#10b981",
                fontFamily: "DM Sans, sans-serif",
                fontWeight: 600,
                fontSize: "12px",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              Copy
            </button>
            <button
              onClick={() => setNewApiKey("")}
              style={{
                padding: "10px 16px",
                borderRadius: "8px",
                border: "1px solid rgba(255,255,255,0.07)",
                background: "transparent",
                color: "rgba(240,242,255,0.4)",
                fontFamily: "DM Sans, sans-serif",
                fontWeight: 600,
                fontSize: "12px",
                cursor: "pointer",
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Hero */}
      <section className="section-reveal" style={{ marginBottom: "48px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "20px", maxWidth: "680px" }}>
          <h2
            style={{
              fontFamily: "Syne, sans-serif",
              fontWeight: 800,
              fontSize: "clamp(32px, 4vw, 52px)",
              letterSpacing: "-2px",
              color: "#f0f2ff",
              lineHeight: 1.05,
            }}
          >
            Sovereign Access Control
          </h2>
          <p
            style={{
              fontFamily: "DM Sans, sans-serif",
              fontWeight: 300,
              fontSize: "17px",
              color: "rgba(240,242,255,0.5)",
              lineHeight: 1.7,
            }}
          >
            The API key is the root of trust for your VeldrixAI instances. Manage cryptographic
            identities and monitor real-time governance health across your entire infrastructure.
          </p>
          <div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="primary-gradient"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "10px",
                padding: "14px 28px",
                borderRadius: "100px",
                border: "none",
                fontFamily: "Syne, sans-serif",
                fontWeight: 700,
                fontSize: "14px",
                color: "white",
                cursor: "pointer",
                transition: "color 0.3s, background-color 0.3s, border-color 0.3s, box-shadow 0.3s, transform 0.3s, opacity 0.3s",
                boxShadow: "0 4px 20px rgba(124,58,237,0.35)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = "0 8px 40px rgba(124,58,237,0.55)";
                e.currentTarget.style.transform = "translateY(-1px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = "0 4px 20px rgba(124,58,237,0.35)";
                e.currentTarget.style.transform = "translateY(0)";
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v8M8 12h8" />
              </svg>
              Generate New API Key
            </button>
          </div>
        </div>
      </section>

      {/* Main Grid */}
      <section
        className="section-reveal"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: "24px",
          alignItems: "start",
          marginBottom: "48px",
          animationDelay: "0.2s",
        } as React.CSSProperties}
      >
        {/* Credentials Table */}
        <div
          className="glass-panel"
          style={{
            gridColumn: "1 / span 2",
            borderRadius: "24px",
            overflow: "hidden",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <div
            style={{
              padding: "20px 28px",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
              background: "rgba(10,12,21,0.4)",
            }}
          >
            <h3
              style={{
                fontFamily: "DM Sans, sans-serif",
                fontSize: "10px",
                fontWeight: 700,
                letterSpacing: "3px",
                textTransform: "uppercase",
                color: "rgba(240,242,255,0.35)",
              }}
            >
              Active Credentials
            </h3>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", textAlign: "left", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "rgba(255,255,255,0.02)" }}>
                  {["Key Identity", "Credential Hash", "Last Activity", ""].map((col, idx) => (
                    <th
                      key={`${col}-${idx}`}
                      style={{
                        padding: "12px 24px",
                        fontFamily: "DM Sans, sans-serif",
                        fontSize: "10px",
                        fontWeight: 700,
                        letterSpacing: "2px",
                        textTransform: "uppercase",
                        color: "rgba(240,242,255,0.25)",
                        borderBottom: "1px solid rgba(255,255,255,0.05)",
                        textAlign: idx === 3 ? "right" : "left",
                      }}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i}>
                      {[1, 2, 3, 4].map((j) => (
                        <td key={j} style={{ padding: "18px 24px" }}>
                          <div
                            className="skeleton-card"
                            style={{
                              height: "12px",
                              borderRadius: "4px",
                              width: j === 1 ? "60%" : j === 2 ? "80%" : j === 3 ? "40%" : "50px",
                            }}
                          />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : apiKeys.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      style={{
                        padding: "40px",
                        textAlign: "center",
                        fontFamily: "DM Sans, sans-serif",
                        fontSize: "14px",
                        color: "rgba(240,242,255,0.25)",
                      }}
                    >
                      No API keys found. Generate your first key above.
                    </td>
                  </tr>
                ) : (
                  apiKeys.map((key, i) => {
                    const isActive = key.is_active;
                    const masked = key.key_prefix || "vx-live-***";
                    const rowIdx = Math.min(i + 1, 3);

                    return (
                      <tr
                        key={key.id}
                        className={`cred-row-reveal cr-${rowIdx}`}
                        style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", transition: "background 0.2s" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.025)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                      >
                        {/* Key Identity */}
                        <td style={{ padding: "18px 24px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                            <div
                              className={isActive ? "key-active-dot" : "key-inactive-dot"}
                              style={{
                                width: "8px",
                                height: "8px",
                                borderRadius: "50%",
                                flexShrink: 0,
                                background: isActive ? "#10b981" : "#f43f5e",
                              }}
                            />
                            <span
                              style={{
                                fontFamily: "Syne, sans-serif",
                                fontWeight: 700,
                                fontSize: "14px",
                                color: "#f0f2ff",
                              }}
                            >
                              {key.name || `Key · ${key.key_prefix || key.id.slice(0, 8)}`}
                            </span>
                          </div>
                        </td>

                        {/* Credential Hash */}
                        <td style={{ padding: "18px 24px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                            <span
                              style={{
                                fontFamily: "JetBrains Mono, monospace",
                                fontSize: "12px",
                                color: "rgba(240,242,255,0.35)",
                                letterSpacing: "0.5px",
                              }}
                            >
                              {masked}
                            </span>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(masked);
                                setCopiedId(key.id);
                                setTimeout(() => setCopiedId(null), 2000);
                              }}
                              style={{
                                background: "none",
                                border: "none",
                                cursor: "pointer",
                                padding: "4px",
                                color: copiedId === key.id ? "#10b981" : "rgba(240,242,255,0.25)",
                                transition: "color 0.2s",
                              }}
                              title="Copy hash"
                            >
                              {copiedId === key.id ? (
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              ) : (
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <rect x="9" y="9" width="13" height="13" rx="2" />
                                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                </svg>
                              )}
                            </button>
                          </div>
                        </td>

                        {/* Last Activity */}
                        <td style={{ padding: "18px 24px" }}>
                          <span
                            style={{
                              fontFamily: "DM Sans, sans-serif",
                              fontSize: "13px",
                              color: key.last_used_at ? "rgba(240,242,255,0.5)" : "rgba(240,242,255,0.2)",
                            }}
                          >
                            {key.last_used_at ? formatRelativeTime(key.last_used_at) : "Inactive"}
                          </span>
                        </td>

                        {/* Actions */}
                        <td style={{ padding: "18px 24px", textAlign: "right" }}>
                          {isActive ? (
                            confirmRevokeId === key.id ? (
                              <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                                <button
                                  onClick={() => handleRevokeKey(key.id)}
                                  style={{
                                    padding: "6px 12px",
                                    borderRadius: "8px",
                                    border: "1px solid rgba(244,63,94,0.4)",
                                    background: "rgba(244,63,94,0.12)",
                                    color: "#f43f5e",
                                    fontFamily: "DM Sans, sans-serif",
                                    fontSize: "11px",
                                    fontWeight: 700,
                                    cursor: "pointer",
                                    transition: "color 0.2s, background-color 0.2s, border-color 0.2s, box-shadow 0.2s, transform 0.2s, opacity 0.2s",
                                  }}
                                >
                                  {revokingId === key.id ? "..." : "Confirm Revoke"}
                                </button>
                                <button
                                  onClick={() => setConfirmRevokeId(null)}
                                  style={{
                                    padding: "6px 12px",
                                    borderRadius: "8px",
                                    border: "1px solid rgba(255,255,255,0.07)",
                                    background: "transparent",
                                    color: "rgba(240,242,255,0.4)",
                                    fontFamily: "DM Sans, sans-serif",
                                    fontSize: "11px",
                                    fontWeight: 600,
                                    cursor: "pointer",
                                  }}
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setConfirmRevokeId(key.id)}
                                style={{
                                  padding: "6px 16px",
                                  borderRadius: "8px",
                                  border: "1px solid rgba(255,255,255,0.07)",
                                  background: "transparent",
                                  color: "rgba(240,242,255,0.35)",
                                  fontFamily: "DM Sans, sans-serif",
                                  fontSize: "11px",
                                  fontWeight: 600,
                                  cursor: "pointer",
                                  transition: "color 0.2s, background-color 0.2s, border-color 0.2s, box-shadow 0.2s, transform 0.2s, opacity 0.2s",
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.color = "#f43f5e";
                                  e.currentTarget.style.borderColor = "rgba(244,63,94,0.3)";
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.color = "rgba(240,242,255,0.35)";
                                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)";
                                }}
                              >
                                Revoke
                              </button>
                            )
                          ) : (
                            <span
                              style={{
                                fontFamily: "DM Sans, sans-serif",
                                fontSize: "10px",
                                fontWeight: 600,
                                letterSpacing: "2px",
                                textTransform: "uppercase",
                                color: "rgba(240,242,255,0.2)",
                              }}
                            >
                              Revoked
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Governance Health Ring */}
        <div
          className="glass-panel"
          style={{
            borderRadius: "24px",
            padding: "36px",
            border: "1px solid rgba(255,255,255,0.06)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "320px",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "radial-gradient(circle at 50% 50%, rgba(16,185,129,0.06), transparent 70%)",
              pointerEvents: "none",
            }}
          />

          <div style={{ position: "relative", width: "220px", height: "220px", marginBottom: "20px" }}>
            <svg width="220" height="220" viewBox="0 0 256 256" style={{ transform: "rotate(-90deg)" }}>
              <circle cx="128" cy="128" r="110" fill="transparent" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
              <circle
                cx="128"
                cy="128"
                r="110"
                fill="transparent"
                stroke="#10b981"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray="691"
                className="gov-ring-fill"
                style={{ "--gov-offset": govOffset } as React.CSSProperties}
              />
            </svg>
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span
                className="gov-score-reveal"
                style={{
                  fontFamily: "Syne, sans-serif",
                  fontWeight: 800,
                  fontSize: "44px",
                  color: "#10b981",
                  letterSpacing: "-2px",
                  lineHeight: 1,
                }}
              >
                {govHealth !== null ? `${govHealth}%` : "—"}
              </span>
              <span
                style={{
                  fontFamily: "DM Sans, sans-serif",
                  fontSize: "10px",
                  fontWeight: 600,
                  letterSpacing: "3px",
                  textTransform: "uppercase",
                  color: "rgba(240,242,255,0.35)",
                  marginTop: "6px",
                }}
              >
                Governance Health
              </span>
            </div>
          </div>

          <p
            style={{
              fontFamily: "DM Sans, sans-serif",
              fontWeight: 300,
              fontSize: "13px",
              color: "rgba(240,242,255,0.4)",
              textAlign: "center",
              lineHeight: 1.6,
              maxWidth: "180px",
            }}
          >
            Real-time cryptographic integrity across all active API nodes
          </p>
        </div>
      </section>

      {/* Network Status Pill */}
      <div
        className="glass-panel network-pill-pulse"
        style={{
          position: "fixed",
          bottom: "40px",
          right: "40px",
          zIndex: 50,
          padding: "12px 20px",
          borderRadius: "100px",
          border: "1px solid rgba(16,185,129,0.2)",
          display: "flex",
          alignItems: "center",
          gap: "12px",
          boxShadow: "0 4px 20px rgba(16,185,129,0.1)",
        }}
      >
        <span
          className="live-dot"
          style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#10b981", display: "inline-block" }}
        />
        <span
          style={{
            fontFamily: "DM Sans, sans-serif",
            fontSize: "10px",
            fontWeight: 700,
            letterSpacing: "3px",
            textTransform: "uppercase",
            color: "rgba(240,242,255,0.5)",
          }}
        >
          Network: Secure &amp; Verifiable
        </span>
      </div>

      {/* Create Key Modal */}
      {showCreateModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(5,8,16,0.8)",
            backdropFilter: "blur(8px)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowCreateModal(false);
          }}
        >
          <div
            className="glass-panel results-panel"
            style={{
              borderRadius: "24px",
              padding: "40px",
              minWidth: "440px",
              border: "1px solid rgba(124,58,237,0.2)",
              boxShadow: "0 20px 80px rgba(124,58,237,0.2)",
            }}
          >
            <h3
              style={{
                fontFamily: "Syne, sans-serif",
                fontWeight: 800,
                fontSize: "24px",
                color: "#f0f2ff",
                marginBottom: "8px",
                letterSpacing: "-0.5px",
              }}
            >
              Generate New API Key
            </h3>
            <p
              style={{
                fontFamily: "DM Sans, sans-serif",
                fontWeight: 300,
                fontSize: "14px",
                color: "rgba(240,242,255,0.45)",
                marginBottom: "28px",
                lineHeight: 1.6,
              }}
            >
              Assign a meaningful name to identify this key in your governance logs.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "24px" }}>
              <label
                style={{
                  fontFamily: "DM Sans, sans-serif",
                  fontSize: "10px",
                  fontWeight: 600,
                  letterSpacing: "3px",
                  textTransform: "uppercase",
                  color: "rgba(240,242,255,0.35)",
                }}
              >
                Key Name (optional)
              </label>
              <input
                type="text"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="e.g. Production_Main_01 (leave empty to auto-generate)"
                autoFocus
                style={{
                  background: "#0a0c15",
                  border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: "12px",
                  padding: "14px 16px",
                  color: "#f0f2ff",
                  fontFamily: "DM Sans, sans-serif",
                  fontSize: "15px",
                  outline: "none",
                  transition: "border-color 0.2s",
                  width: "100%",
                }}
                onFocus={(e) => (e.target.style.borderColor = "rgba(124,58,237,0.5)")}
                onBlur={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.07)")}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateKey();
                  if (e.key === "Escape") setShowCreateModal(false);
                }}
              />
            </div>

            <div style={{ display: "flex", gap: "12px" }}>
              <button
                onClick={handleCreateKey}
                disabled={isCreating}
                className="primary-gradient"
                style={{
                  flex: 1,
                  padding: "14px",
                  borderRadius: "12px",
                  border: "none",
                  fontFamily: "Syne, sans-serif",
                  fontWeight: 700,
                  fontSize: "14px",
                  color: "white",
                  cursor: isCreating ? "not-allowed" : "pointer",
                  opacity: isCreating ? 0.7 : 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  transition: "color 0.2s, background-color 0.2s, border-color 0.2s, box-shadow 0.2s, transform 0.2s, opacity 0.2s",
                }}
              >
                {isCreating && (
                  <svg
                    className="eval-spinner"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                  </svg>
                )}
                {isCreating ? "Generating..." : "Generate Key"}
              </button>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setNewKeyName("");
                }}
                style={{
                  padding: "14px 20px",
                  borderRadius: "12px",
                  border: "1px solid rgba(255,255,255,0.07)",
                  background: "transparent",
                  color: "rgba(240,242,255,0.5)",
                  fontFamily: "DM Sans, sans-serif",
                  fontWeight: 600,
                  fontSize: "14px",
                  cursor: "pointer",
                  transition: "color 0.2s, background-color 0.2s, border-color 0.2s, box-shadow 0.2s, transform 0.2s, opacity 0.2s",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
