"use client";

import { useEffect, useState } from "react";

interface AccountTabProps {
  searchQuery: string;
  showToast: (msg: string) => void;
}

type User = { id: string; email: string; role: string; is_active: boolean };

export default function AccountTab({ searchQuery, showToast }: AccountTabProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((u) => setUser(u))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const hidden = (terms: string) =>
    searchQuery && !terms.toLowerCase().includes(searchQuery.toLowerCase()) ? " vx-hidden" : "";

  if (loading) return <div className="vx-empty"><p>Loading profile...</p></div>;
  if (!user) return <div className="vx-error">Failed to load profile.</div>;

  return (
    <div>
      <div className={"vx-card" + hidden("profile email role account")} data-search-terms="profile email role account">
        <div className="vx-card-header">
          <div>
            <div className="vx-card-title">Profile</div>
            <div className="vx-card-subtitle">Your account details from VeldrixAI Auth</div>
          </div>
        </div>
        <div className="vx-detail-row">
          <span className="vx-detail-key">Email</span>
          <span className="vx-detail-value">{user.email}</span>
        </div>
        <div className="vx-detail-row">
          <span className="vx-detail-key">Role</span>
          <span className="vx-badge vx-badge-accent">{user.role}</span>
        </div>
        <div className="vx-detail-row">
          <span className="vx-detail-key">Status</span>
          <span className={`vx-badge ${user.is_active ? "vx-badge-success" : "vx-badge-error"}`}>
            {user.is_active ? "Active" : "Inactive"}
          </span>
        </div>
        <div className="vx-detail-row">
          <span className="vx-detail-key">User ID</span>
          <span className="vx-detail-value" style={{ fontFamily: "monospace", fontSize: "0.8rem" }}>{user.id}</span>
        </div>
        <p style={{ fontSize: "0.82rem", color: "var(--vx-text-muted)", marginTop: "1rem" }}>
          Profile editing is managed through your organisation administrator.
        </p>
      </div>

      <div className={"vx-card" + hidden("preferences coming soon")} data-search-terms="preferences coming soon">
        <div className="vx-card-header">
          <div>
            <div className="vx-card-title">Preferences</div>
          </div>
          <span className="vx-badge vx-badge-warning">Coming Soon</span>
        </div>
        <p style={{ fontSize: "0.85rem", color: "var(--vx-text-secondary)", lineHeight: 1.6 }}>
          Timezone, theme, and dashboard range preferences will be configurable in a future release.
        </p>
      </div>
    </div>
  );
}
