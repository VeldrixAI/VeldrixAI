"use client";

import { FormEvent, useEffect, useState } from "react";

type ApiKey = {
  id: string;
  name?: string | null;
  is_active: boolean;
  created_at: string;
  last_used_at?: string | null;
  key_prefix?: string;
};

// Generate unique two-word name for API keys
function generateUniqueName(): string {
  const adjectives = [
    "Swift", "Bright", "Noble", "Cosmic", "Azure", "Golden", "Silver", "Crystal",
    "Quantum", "Stellar", "Radiant", "Mystic", "Thunder", "Phoenix", "Dragon", "Falcon",
    "Titan", "Omega", "Alpha", "Prime", "Nexus", "Vertex", "Apex", "Zenith"
  ];
  
  const nouns = [
    "Key", "Gate", "Portal", "Bridge", "Vault", "Shield", "Beacon", "Prism",
    "Core", "Node", "Link", "Forge", "Cipher", "Matrix", "Nexus", "Conduit",
    "Engine", "Reactor", "Pulse", "Wave", "Stream", "Flow", "Path", "Route"
  ];
  
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  
  return `${adj} ${noun}`;
}

export default function ApiKeysPage() {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [keyName, setKeyName] = useState("");
  const [newApiKey, setNewApiKey] = useState("");
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  useEffect(() => {
    loadKeys();
  }, []);

  async function loadKeys() {
    try {
      const res = await fetch("/api/api-keys");
      if (res.ok) setApiKeys(await res.json());
    } catch {
      setError("Failed to load API keys");
    }
  }

  async function createKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    
    // Generate unique name if user didn't provide one
    const finalName = keyName.trim() || generateUniqueName();
    
    try {
      const result = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: finalName }),
      });
      const payload = await result.json();
      if (!result.ok) throw new Error(payload.error || "Failed to create API key");
      setNewApiKey(payload.api_key);
      setKeyName("");
      await loadKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create key");
    }
  }

  async function saveEdit(keyId: string) {
    try {
      const result = await fetch(`/api/api-keys/${keyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName }),
      });
      if (!result.ok) throw new Error("Failed to update key");
      setEditingId(null);
      setEditName("");
      await loadKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update key");
    }
  }

  async function revokeKey(keyId: string) {
    if (!confirm("Are you sure you want to revoke this API key? This cannot be undone.")) return;
    try {
      const result = await fetch(`/api/api-keys/${keyId}`, { method: "DELETE" });
      if (!result.ok) throw new Error("Failed to revoke key");
      await loadKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke key");
    }
  }

  async function removeKey(keyId: string, keyName: string | null) {
    if (!confirm(`Permanently remove "${keyName}" from the list? This cannot be undone.`)) return;
    try {
      // Call the same DELETE endpoint - backend should handle permanent deletion
      const result = await fetch(`/api/api-keys/${keyId}?permanent=true`, { method: "DELETE" });
      if (!result.ok) throw new Error("Failed to remove key");
      // Remove from local state immediately
      setApiKeys((prev) => prev.filter((k) => k.id !== keyId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove key");
    }
  }

  return (
    <div className="vx-content">
      <h1 className="vx-page-title">API Keys</h1>
      <p className="vx-page-desc">Generate and manage API keys for programmatic access to VeldrixAI.</p>

      {error && <div className="vx-error">{error}</div>}

      <div className="vx-card vx-card-accent">
        <div className="vx-card-header">
          <div className="vx-card-title">Create New Key</div>
        </div>
        <form onSubmit={createKey} style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <label className="vx-label">Key Name (optional)</label>
            <input
              className="vx-input"
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              placeholder="e.g., Production SDK (leave empty for auto-generated name)"
            />
          </div>
          <button className="vx-btn vx-btn-primary" type="submit">
            Generate Key
          </button>
        </form>
      </div>

      {newApiKey && (
        <div className="vx-notice">
          <strong style={{ display: "block", marginBottom: "0.5rem" }}>Key Created Successfully</strong>
          <p style={{ marginBottom: "0.75rem", fontSize: "0.875rem" }}>Copy this key now. It will not be shown again.</p>
          <code style={{ display: "block", padding: "0.75rem 1rem", background: "rgba(0,0,0,0.3)", borderRadius: "8px", fontFamily: "monospace", fontSize: "0.85rem", wordBreak: "break-all", marginBottom: "0.75rem" }}>{newApiKey}</code>
          <button className="vx-btn vx-btn-secondary vx-btn-sm" onClick={() => setNewApiKey("")}>
            Dismiss
          </button>
        </div>
      )}

      <div className="vx-card">
        <div className="vx-card-header">
          <div>
            <div className="vx-card-title">Your API Keys</div>
            <div style={{ fontSize: "0.85rem", color: "var(--vx-text-muted)", marginTop: "0.25rem" }}>{apiKeys.length} key{apiKeys.length !== 1 ? "s" : ""} total</div>
          </div>
        </div>

        {apiKeys.length === 0 ? (
          <div className="vx-empty">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: "0 auto 1rem", color: "var(--vx-text-muted)" }}>
              <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
            </svg>
            <p>No API keys yet. Create your first key above.</p>
          </div>
        ) : (
          <table className="vx-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Prefix</th>
                <th>Created</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {apiKeys.map((key) => (
                <tr key={key.id}>
                  <td>
                    {editingId === key.id ? (
                      <input
                        className="vx-input"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        style={{ maxWidth: 200, padding: "0.4rem 0.75rem", fontSize: "0.85rem" }}
                        autoFocus
                      />
                    ) : (
                      <span style={{ fontWeight: 500 }}>{key.name || generateUniqueName()}</span>
                    )}
                  </td>
                  <td>
                    <code style={{ fontSize: "0.8rem", color: "var(--vx-text-muted)", fontFamily: "monospace" }}>
                      {key.key_prefix || "vx-live-***"}
                    </code>
                  </td>
                  <td>{new Date(key.created_at).toLocaleDateString()}</td>
                  <td>
                    <span className={`vx-badge ${key.is_active ? "vx-badge-success" : "vx-badge-error"}`}>
                      {key.is_active ? "Active" : "Revoked"}
                    </span>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                      {key.is_active ? (
                        // Active key actions
                        editingId === key.id ? (
                          <>
                            <button className="vx-btn vx-btn-primary vx-btn-sm" onClick={() => saveEdit(key.id)}>Save</button>
                            <button className="vx-btn vx-btn-secondary vx-btn-sm" onClick={() => { setEditingId(null); setEditName(""); }}>Cancel</button>
                          </>
                        ) : (
                          <>
                            <button className="vx-btn vx-btn-secondary vx-btn-sm" onClick={() => { setEditingId(key.id); setEditName(key.name || ""); }}>Rename</button>
                            <button className="vx-btn vx-btn-danger vx-btn-sm" onClick={() => revokeKey(key.id)}>Revoke</button>
                          </>
                        )
                      ) : (
                        // Revoked key actions - only show Remove button
                        <button 
                          className="vx-btn vx-btn-danger vx-btn-sm" 
                          onClick={() => removeKey(key.id, key.name ?? null)}
                          style={{ opacity: 0.8 }}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
