"use client";

import Link from "next/link";

interface DeveloperTabProps {
  searchQuery: string;
  showToast: (msg: string) => void;
}

const ENV_VARS = [
  { name: "VELDRIX_API_KEY", description: "Your API authentication key", example: "veldrix_live_xxxxxxxxxxxx" },
  { name: "VELDRIX_CORE_API_URL", description: "Trust evaluation API base URL", example: "http://localhost:8001" },
  { name: "VELDRIX_CONNECTORS_API_URL", description: "Reports & connectors API base URL", example: "http://localhost:8002" },
  { name: "VELDRIX_AUTH_API_URL", description: "Auth service base URL", example: "http://localhost:8000" },
];

export default function DeveloperTab({ searchQuery, showToast }: DeveloperTabProps) {
  const isVisible = (terms: string) =>
    !searchQuery || terms.toLowerCase().includes(searchQuery.toLowerCase());

  function copy(text: string) {
    navigator.clipboard.writeText(text).catch(() => {});
    showToast("Copied to clipboard");
  }

  return (
    <div>
      <div className={`vx-card ${isVisible("sdk install quickstart documentation") ? "" : "vx-hidden"}`}>
        <div className="vx-card-header">
          <div>
            <div className="vx-card-title">SDK Quick Links</div>
            <div className="vx-card-subtitle">Jump to SDK documentation and guides</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <Link href="/dashboard/sdk" className="vx-btn vx-btn-ghost">Installation Guide</Link>
          <Link href="/dashboard/sdk" className="vx-btn vx-btn-ghost">Quickstart</Link>
          <a href="https://github.com/veldrixai/veldrix-sdk-python" target="_blank" rel="noopener noreferrer" className="vx-btn vx-btn-ghost">GitHub</a>
        </div>
      </div>

      <div className={`vx-card ${isVisible("environment variables env api key base url") ? "" : "vx-hidden"}`} style={{ marginTop: "1rem" }}>
        <div className="vx-card-header">
          <div>
            <div className="vx-card-title">Environment Variables</div>
            <div className="vx-card-subtitle">Required environment variables for your integration</div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {ENV_VARS.map((ev) => (
            <div key={ev.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.85rem 1rem", background: "var(--vx-surface)", borderRadius: "var(--vx-radius)", border: "1px solid var(--vx-border)" }}>
              <div>
                <div style={{ fontFamily: "'SF Mono', 'Fira Code', monospace", fontSize: "0.85rem", fontWeight: 600, color: "var(--vx-text)" }}>{ev.name}</div>
                <div style={{ fontSize: "0.82rem", color: "var(--vx-text-secondary)", marginTop: "0.2rem" }}>{ev.description}</div>
              </div>
              <button className="vx-btn vx-btn-ghost vx-btn-sm" onClick={() => copy(`export ${ev.name}=${ev.example}`)}>Copy</button>
            </div>
          ))}
        </div>
      </div>

      <div className={`vx-card ${isVisible("webhooks events") ? "" : "vx-hidden"}`} style={{ marginTop: "1rem" }}>
        <div className="vx-card-header">
          <div>
            <div className="vx-card-title">Webhooks</div>
            <div className="vx-card-subtitle">Real-time event notifications</div>
          </div>
          <span className="vx-badge vx-badge-warning">Coming Soon</span>
        </div>
        <p style={{ fontSize: "0.85rem", color: "var(--vx-text-secondary)", lineHeight: 1.6 }}>
          Webhook delivery for events like <code>request.blocked</code> and <code>request.escalated</code> is planned for a future release.
        </p>
      </div>
    </div>
  );
}
