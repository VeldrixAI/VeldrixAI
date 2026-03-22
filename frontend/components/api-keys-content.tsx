"use client";

import { FormEvent, useEffect, useState } from "react";

type ApiKey = {
  id: string;
  name?: string | null;
  is_active: boolean;
  created_at: string;
  last_used_at?: string | null;
};

export function ApiKeysContent() {
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
      if (res.ok) {
        const data = await res.json();
        setApiKeys(data);
      }
    } catch (err) {
      setError("Failed to load API keys");
    }
  }

  async function createKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      const result = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: keyName || null })
      });
      const payload = await result.json();
      if (!result.ok) {
        throw new Error(payload.error || "Failed to create API key");
      }
      setNewApiKey(payload.api_key);
      setKeyName("");
      await loadKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create key");
    }
  }

  function startEdit(key: ApiKey) {
    setEditingId(key.id);
    setEditName(key.name || "");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
  }

  async function saveEdit(keyId: string) {
    try {
      const result = await fetch(`/api/api-keys/${keyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName })
      });
      if (!result.ok) {
        throw new Error("Failed to update key");
      }
      setEditingId(null);
      setEditName("");
      await loadKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update key");
    }
  }

  async function deleteKey(keyId: string) {
    if (!confirm("Are you sure you want to revoke this API key?")) return;
    try {
      const result = await fetch(`/api/api-keys/${keyId}`, {
        method: "DELETE"
      });
      if (!result.ok) {
        throw new Error("Failed to revoke key");
      }
      await loadKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke key");
    }
  }

  return (
    <div className="shell dashboard-content">
      <div className="page-header">
        <h1>API Key Management</h1>
        <p>Generate and manage API keys for programmatic access</p>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="api-keys-section">
        <form onSubmit={createKey} className="create-key-form">
          <div className="form-group">
            <label>
              <span>Key Name (Optional)</span>
              <input
                value={keyName}
                onChange={(e) => setKeyName(e.target.value)}
                placeholder="e.g., Production SDK"
              />
            </label>
          </div>
          <button className="solid-btn" type="submit">Generate New Key</button>
        </form>

        {newApiKey && (
          <div className="notice">
            <strong>New API Key Created</strong>
            <p>Copy this key now - it won't be shown again:</p>
            <code>{newApiKey}</code>
            <button className="ghost-btn" onClick={() => setNewApiKey("")}>Dismiss</button>
          </div>
        )}

        <div className="keys-list">
          <h3>Your API Keys</h3>
          {apiKeys.length === 0 ? (
            <p className="empty-state">No API keys yet. Generate your first key above.</p>
          ) : (
            <div className="keys-table">
              {apiKeys.map((key) => (
                <div key={key.id} className="key-row">
                  <div className="key-info">
                    {editingId === key.id ? (
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="edit-input"
                      />
                    ) : (
                      <div>
                        <strong>{key.name || "Unnamed Key"}</strong>
                        <span className="key-date">
                          Created: {new Date(key.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="key-actions">
                    <span className={`status-badge ${key.is_active ? 'active' : 'inactive'}`}>
                      {key.is_active ? "Active" : "Revoked"}
                    </span>
                    {editingId === key.id ? (
                      <>
                        <button className="solid-btn small" onClick={() => saveEdit(key.id)}>Update</button>
                        <button className="ghost-btn small" onClick={cancelEdit}>Cancel</button>
                      </>
                    ) : (
                      <>
                        <button className="ghost-btn small" onClick={() => startEdit(key)}>Edit</button>
                        {key.is_active && (
                          <button className="ghost-btn small danger" onClick={() => deleteKey(key.id)}>Revoke</button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
