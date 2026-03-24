"use client";

import { useState, useEffect } from "react";

interface ApiKey {
  id: string;
  name?: string | null;
  is_active: boolean;
  created_at: string;
  last_used_at?: string | null;
  key_prefix?: string | null;
}

interface ApiKeysTabProps {
  searchQuery: string;
  showToast: (msg: string) => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function ApiKeysTab({ searchQuery, showToast }: ApiKeysTabProps) {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showRevokeModal, setShowRevokeModal] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState<string | null>(null);
  const [newKeyRevealed, setNewKeyRevealed] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function loadKeys() {
    setLoading(true);
    try {
      const res = await fetch("/api/api-keys");
      if (res.ok) setKeys(await res.json());
      else showToast("Failed to load API keys");
    } catch {
      showToast("Failed to load API keys");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadKeys(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreate = async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newLabel.trim() || "Untitled Key" }),
      });
      const payload = await res.json();
      if (!res.ok) { showToast(payload.error || "Failed to create key"); return; }
      if (payload.api_key) setNewKeyRevealed(payload.api_key);
      await loadKeys();
      showToast("API key created");
    } catch {
      showToast("Failed to create API key");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevoke = async (id: string) => {
    try {
      const res = await fetch(`/api/api-keys/${id}`, { method: "DELETE" });
      if (!res.ok) { showToast("Failed to revoke key"); return; }
      await loadKeys();
      setShowRevokeModal(null);
      showToast("Key revoked");
    } catch {
      showToast("Failed to revoke key");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/api-keys/${id}?permanent=true`, { method: "DELETE" });
      if (!res.ok) { showToast("Failed to delete key"); return; }
      setKeys((prev) => prev.filter((k) => k.id !== id));
      setShowDeleteModal(null);
      showToast("API key permanently deleted");
    } catch {
      showToast("Failed to delete key");
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    showToast("Copied to clipboard");
  };

  const closeCreateModal = () => {
    setShowCreateModal(false);
    setNewKeyRevealed(null);
    setNewLabel("");
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
        {loading ? (
          <div style={{ textAlign: "center", padding: "2rem", color: "var(--vx-text-muted)", fontSize: "0.9rem" }}>
            Loading API keys...
          </div>
        ) : keys.length === 0 ? (
          <div style={{ textAlign: "center", padding: "2rem", color: "var(--vx-text-muted)", fontSize: "0.9rem" }}>
            No API keys yet. Create one to get started.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="vx-table">
              <thead>
                <tr>
                  <th>Label</th>
                  <th>Key Prefix</th>
                  <th>Created</th>
                  <th>Last Used</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id}>
                    <td style={{ fontWeight: 600 }}>{k.name || "—"}</td>
                    <td>
                      <code style={{ fontFamily: "'SF Mono', 'Fira Code', monospace", fontSize: "0.82rem" }}>
                        {k.key_prefix ? `${k.key_prefix}****` : "—"}
                      </code>
                    </td>
                    <td>{formatDate(k.created_at)}</td>
                    <td>{k.last_used_at ? formatDate(k.last_used_at) : "—"}</td>
                    <td>
                      <span className={`vx-badge ${k.is_active ? "vx-badge-success" : "vx-badge-warning"}`}>
                        {k.is_active ? "Active" : "Revoked"}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                        {k.key_prefix && (
                          <button
                            className="vx-btn vx-btn-ghost vx-btn-sm"
                            onClick={() => handleCopy(k.key_prefix!)}
                          >
                            Copy Prefix
                          </button>
                        )}
                        {k.is_active && (
                          <button
                            className="vx-btn vx-btn-ghost vx-btn-sm"
                            onClick={() => setShowRevokeModal(k.id)}
                          >
                            Revoke
                          </button>
                        )}
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
        )}
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
          <strong>Key rotation:</strong> Revoke the old key and create a new one. Keys show their full value only once at creation.
        </div>
      </div>

      {/* Create Modal */}
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
                <div className="vx-form-group">
                  <label className="vx-label">Label</label>
                  <input
                    className="vx-input"
                    placeholder="e.g. Production API"
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                  />
                </div>
              ) : (
                <div className="vx-key-reveal">
                  <p style={{ fontSize: "0.875rem", color: "var(--vx-text-secondary)", marginBottom: "0.75rem" }}>
                    This key will only be shown once. Copy it now and store it securely.
                  </p>
                  <code style={{ display: "block", wordBreak: "break-all", background: "var(--vx-surface)", padding: "0.75rem", borderRadius: "6px", border: "1px solid var(--vx-border)", fontSize: "0.82rem" }}>
                    {newKeyRevealed}
                  </code>
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
                  <button className="vx-btn vx-btn-primary" onClick={handleCreate} disabled={submitting}>
                    {submitting ? "Creating..." : "Create Key"}
                  </button>
                </>
              ) : (
                <button className="vx-btn vx-btn-ghost" onClick={closeCreateModal}>Done</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Revoke Modal */}
      {showRevokeModal && (
        <div className="vx-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowRevokeModal(null); }}>
          <div className="vx-modal">
            <div className="vx-modal-header">
              <h3 className="vx-modal-title">Revoke API Key</h3>
              <button className="vx-modal-close" onClick={() => setShowRevokeModal(null)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <div className="vx-modal-body">
              <p style={{ fontSize: "0.9rem", color: "var(--vx-text-secondary)" }}>
                Revoking this key will prevent it from being used immediately. The key record will remain visible but inactive.
              </p>
            </div>
            <div className="vx-modal-footer">
              <button className="vx-btn vx-btn-ghost" onClick={() => setShowRevokeModal(null)}>Cancel</button>
              <button className="vx-btn vx-btn-primary" onClick={() => handleRevoke(showRevokeModal)}>Revoke Key</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
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
                This will permanently delete the key and cannot be undone.
              </p>
            </div>
            <div className="vx-modal-footer">
              <button className="vx-btn vx-btn-ghost" onClick={() => setShowDeleteModal(null)}>Cancel</button>
              <button className="vx-btn vx-btn-danger" onClick={() => handleDelete(showDeleteModal)}>Delete Permanently</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
