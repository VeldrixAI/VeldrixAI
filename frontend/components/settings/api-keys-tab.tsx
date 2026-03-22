"use client";

import { useState } from "react";
import { settingsApiKeys } from "../../mock/settings";
import type { SettingsApiKey } from "../../mock/types";

interface ApiKeysTabProps {
  searchQuery: string;
  showToast: (msg: string) => void;
}

function generateKey(env: string): string {
  const prefix = env === "Production" ? "ak_live_" : env === "Staging" ? "ak_test_" : "ak_dev_";
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = prefix;
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function maskKey(key: string): string {
  if (key.length <= 12) return key;
  return key.substring(0, key.indexOf("_", 3) + 1) + "****" + key.slice(-4);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function ApiKeysTab({ searchQuery, showToast }: ApiKeysTabProps) {
  const [keys, setKeys] = useState<SettingsApiKey[]>([...settingsApiKeys]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showRotateModal, setShowRotateModal] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState<string | null>(null);
  const [newKeyRevealed, setNewKeyRevealed] = useState<string | null>(null);

  const [newLabel, setNewLabel] = useState("");
  const [newEnv, setNewEnv] = useState<"Development" | "Staging" | "Production">("Development");
  const [newScopes, setNewScopes] = useState<string[]>([]);
  const [newRateLimit, setNewRateLimit] = useState("standard");

  const allScopes = ["Analyze", "Generate", "Agent-Check", "Reports"];

  const toggleScope = (scope: string) => {
    setNewScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  };

  const handleCreate = () => {
    const fullKey = generateKey(newEnv);
    const newKey: SettingsApiKey = {
      id: "key_" + Date.now(),
      label: newLabel || "Untitled Key",
      key: maskKey(fullKey),
      createdAt: new Date().toISOString(),
      lastUsed: "",
      status: "Active",
      environment: newEnv,
      scopes: newScopes.length > 0 ? newScopes : ["Analyze"],
    };
    setKeys((prev) => [newKey, ...prev]);
    setNewKeyRevealed(fullKey);
    showToast("API key created");
  };

  const handleRotate = (id: string) => {
    const key = keys.find((k) => k.id === id);
    if (!key) return;
    const fullKey = generateKey(key.environment);
    setKeys((prev) =>
      prev.map((k) => (k.id === id ? { ...k, key: maskKey(fullKey) } : k))
    );
    setNewKeyRevealed(fullKey);
    setShowRotateModal(null);
    showToast("Key rotated successfully");
  };

  const handleDelete = (id: string) => {
    setKeys((prev) => prev.filter((k) => k.id !== id));
    setShowDeleteModal(null);
    showToast("API key deleted");
  };

  const handleToggleStatus = (id: string) => {
    setKeys((prev) =>
      prev.map((k) =>
        k.id === id ? { ...k, status: k.status === "Active" ? "Disabled" : "Active" } : k
      )
    );
    const key = keys.find((k) => k.id === id);
    showToast(key?.status === "Active" ? "Key disabled" : "Key enabled");
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    showToast("Key copied");
  };

  const closeCreateModal = () => {
    setShowCreateModal(false);
    setNewKeyRevealed(null);
    setNewLabel("");
    setNewEnv("Development");
    setNewScopes([]);
    setNewRateLimit("standard");
  };

  const tableVisible = !searchQuery || "api key keys label created status actions".includes(searchQuery.toLowerCase());
  const helperVisible = !searchQuery || "api key storage rotation best practices".toLowerCase().includes(searchQuery.toLowerCase());

  return (
    <>
      <div style={{ marginBottom: "1.25rem" }}>
        <button className="vx-btn vx-btn-primary" onClick={() => setShowCreateModal(true)}>
          Create API Key
        </button>
      </div>

      <div className={`vx-card ${tableVisible ? "" : "vx-hidden"}`} data-search-terms="api keys table label key created status actions">
        <div style={{ overflowX: "auto" }}>
          <table className="vx-table">
            <thead>
              <tr>
                <th>Label</th>
                <th>Key</th>
                <th>Created</th>
                <th>Last Used</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id}>
                  <td style={{ fontWeight: 600 }}>{k.label}</td>
                  <td>
                    <code style={{ fontFamily: "'SF Mono', 'Fira Code', monospace", fontSize: "0.82rem" }}>
                      {k.key}
                    </code>
                  </td>
                  <td>{formatDate(k.createdAt)}</td>
                  <td>{k.lastUsed ? formatDate(k.lastUsed) : "—"}</td>
                  <td>
                    <span className={`vx-badge ${k.status === "Active" ? "vx-badge-success" : "vx-badge-warning"}`}>
                      {k.status}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                      <button
                        className="vx-btn vx-btn-ghost vx-btn-sm"
                        onClick={() => handleCopy(k.key)}
                      >
                        Copy
                      </button>
                      <button
                        className="vx-btn vx-btn-ghost vx-btn-sm"
                        onClick={() => setShowRotateModal(k.id)}
                      >
                        Rotate
                      </button>
                      <button
                        className="vx-btn vx-btn-ghost vx-btn-sm"
                        onClick={() => handleToggleStatus(k.id)}
                      >
                        {k.status === "Active" ? "Disable" : "Enable"}
                      </button>
                      <button
                        className="vx-btn vx-btn-danger vx-btn-sm"
                        onClick={() => setShowDeleteModal(k.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className={`vx-card ${helperVisible ? "" : "vx-hidden"}`} data-search-terms="api key storage rotation best practices">
        <h3 className="vx-card-title" style={{ marginBottom: "1rem" }}>Best Practices</h3>
        <div className="vx-settings-helper" style={{ marginBottom: "0.75rem" }}>
          <strong>How to store keys:</strong> Set your API key as an environment variable:
          <code style={{ display: "block", marginTop: "0.5rem", fontFamily: "'SF Mono', 'Fira Code', monospace", fontSize: "0.82rem", background: "var(--vx-surface)", padding: "0.5rem 0.75rem", borderRadius: "6px", border: "1px solid var(--vx-border)" }}>
            export VELDRIX_API_KEY=veldrix_live_xxx
          </code>
        </div>
        <div className="vx-settings-helper">
          <strong>Key rotation:</strong> Rotate keys every 90 days. Use the Rotate action to generate a new key without downtime.
        </div>
      </div>

      {showCreateModal && (
        <div className="vx-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeCreateModal(); }}>
          <div className="vx-modal">
            <div className="vx-modal-header">
              <h3 className="vx-modal-title">Create API Key</h3>
              <button className="vx-modal-close" onClick={closeCreateModal}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <div className="vx-modal-body">
              {newKeyRevealed === null ? (
                <>
                  <div className="vx-form-group">
                    <label className="vx-label">Label</label>
                    <input
                      className="vx-input"
                      placeholder="e.g. Production API"
                      value={newLabel}
                      onChange={(e) => setNewLabel(e.target.value)}
                    />
                  </div>
                  <div className="vx-form-group">
                    <label className="vx-label">Environment</label>
                    <select
                      className="vx-input"
                      value={newEnv}
                      onChange={(e) => setNewEnv(e.target.value as "Development" | "Staging" | "Production")}
                    >
                      <option value="Development">Development</option>
                      <option value="Staging">Staging</option>
                      <option value="Production">Production</option>
                    </select>
                  </div>
                  <div className="vx-form-group">
                    <label className="vx-label">Scopes</label>
                    <div className="vx-scope-checks">
                      {allScopes.map((scope) => (
                        <label key={scope}>
                          <input
                            type="checkbox"
                            checked={newScopes.includes(scope)}
                            onChange={() => toggleScope(scope)}
                          />
                          {scope}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="vx-form-group">
                    <label className="vx-label">Rate Limit</label>
                    <select
                      className="vx-input"
                      value={newRateLimit}
                      onChange={(e) => setNewRateLimit(e.target.value)}
                    >
                      <option value="standard">Standard (1,000/min)</option>
                      <option value="high">High (5,000/min)</option>
                      <option value="unlimited">Unlimited</option>
                    </select>
                  </div>
                </>
              ) : (
                <div className="vx-key-reveal">
                  <p>This key will only be shown once. Copy it now.</p>
                  <code>{newKeyRevealed}</code>
                  <button
                    className="vx-btn vx-btn-primary vx-btn-sm"
                    style={{ marginTop: "0.75rem" }}
                    onClick={() => handleCopy(newKeyRevealed)}
                  >
                    Copy Key
                  </button>
                </div>
              )}
            </div>
            <div className="vx-modal-footer">
              {newKeyRevealed === null ? (
                <>
                  <button className="vx-btn vx-btn-ghost" onClick={closeCreateModal}>Cancel</button>
                  <button className="vx-btn vx-btn-primary" onClick={handleCreate}>Create Key</button>
                </>
              ) : (
                <button className="vx-btn vx-btn-ghost" onClick={closeCreateModal}>Close</button>
              )}
            </div>
          </div>
        </div>
      )}

      {showRotateModal && (
        <div className="vx-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) { setShowRotateModal(null); setNewKeyRevealed(null); } }}>
          <div className="vx-modal">
            <div className="vx-modal-header">
              <h3 className="vx-modal-title">Rotate API Key</h3>
              <button className="vx-modal-close" onClick={() => { setShowRotateModal(null); setNewKeyRevealed(null); }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <div className="vx-modal-body">
              {newKeyRevealed === null ? (
                <p style={{ fontSize: "0.9rem", color: "var(--vx-text-secondary)" }}>
                  Rotating this key will invalidate the old key immediately. A new key will be generated.
                </p>
              ) : (
                <div className="vx-key-reveal">
                  <p>This key will only be shown once. Copy it now.</p>
                  <code>{newKeyRevealed}</code>
                  <button
                    className="vx-btn vx-btn-primary vx-btn-sm"
                    style={{ marginTop: "0.75rem" }}
                    onClick={() => handleCopy(newKeyRevealed)}
                  >
                    Copy Key
                  </button>
                </div>
              )}
            </div>
            <div className="vx-modal-footer">
              {newKeyRevealed === null ? (
                <>
                  <button className="vx-btn vx-btn-ghost" onClick={() => { setShowRotateModal(null); setNewKeyRevealed(null); }}>Cancel</button>
                  <button className="vx-btn vx-btn-primary" onClick={() => handleRotate(showRotateModal)}>Rotate</button>
                </>
              ) : (
                <button className="vx-btn vx-btn-ghost" onClick={() => { setShowRotateModal(null); setNewKeyRevealed(null); }}>Close</button>
              )}
            </div>
          </div>
        </div>
      )}

      {showDeleteModal && (
        <div className="vx-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowDeleteModal(null); }}>
          <div className="vx-modal">
            <div className="vx-modal-header">
              <h3 className="vx-modal-title">Delete API Key</h3>
              <button className="vx-modal-close" onClick={() => setShowDeleteModal(null)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <div className="vx-modal-body">
              <p style={{ fontSize: "0.9rem", color: "var(--vx-text-secondary)" }}>
                Are you sure you want to delete this API key? This action cannot be undone.
              </p>
            </div>
            <div className="vx-modal-footer">
              <button className="vx-btn vx-btn-ghost" onClick={() => setShowDeleteModal(null)}>Cancel</button>
              <button className="vx-btn vx-btn-danger" onClick={() => handleDelete(showDeleteModal)}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}