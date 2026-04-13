import type { Metadata } from "next";
import Link from "next/link";
import { SIDEBAR_GROUPS } from "@/lib/docs/pages";
import "./docs.css";

export const metadata: Metadata = {
  title: {
    template: "%s — VeldrixAI Docs",
    default: "Documentation — VeldrixAI",
  },
  description: "VeldrixAI developer documentation. Guides, API reference, and integration resources.",
};

// ── Logo mark (reused from landing page) ─────────────────────────────────────
function DocsLogo() {
  return (
    <svg width="22" height="22" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="dg1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#c4b5fd"/><stop offset="50%" stopColor="#818cf8"/><stop offset="100%" stopColor="#67e8f9"/>
        </linearGradient>
        <linearGradient id="dg2" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95"/><stop offset="100%" stopColor="#a78bfa"/>
        </linearGradient>
        <linearGradient id="dsq" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.4"/><stop offset="100%" stopColor="#06b6d4" stopOpacity="0.2"/>
        </linearGradient>
      </defs>
      <rect x="8" y="8" width="84" height="84" rx="18" fill="url(#dsq)" stroke="url(#dg1)" strokeWidth="1"/>
      <path d="M24 30 L50 70 L76 30" fill="none" stroke="url(#dg2)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="50" cy="70" r="5" fill="url(#dg1)"/>
      <circle cx="50" cy="70" r="2.5" fill="white" opacity="0.9"/>
    </svg>
  );
}

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="docs-root">
      {/* ── Topbar ── */}
      <header className="docs-topbar" role="banner">
        <div className="docs-topbar-inner">
          <Link href="/" className="docs-brand" aria-label="VeldrixAI home">
            <DocsLogo />
            <span className="docs-brand-wordmark">VeldrixAI</span>
            <span className="docs-brand-divider" aria-hidden="true" />
            <span className="docs-brand-section">Docs</span>
          </Link>

          <nav className="docs-topbar-nav" aria-label="Documentation sections">
            <Link href="/docs" className="docs-topbar-link">Docs</Link>
            <Link href="/docs/integrations-rest" className="docs-topbar-link">API Reference</Link>
            <a href="#" className="docs-topbar-link">Changelog</a>
            <a href="#" className="docs-topbar-link">Status</a>
          </nav>

          <div className="docs-topbar-actions">
            <button
              className="docs-search-btn"
              aria-label="Search documentation (Ctrl+K)"
              id="docs-search-trigger"
              type="button"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              <span>Search docs</span>
              <kbd className="docs-kbd" aria-label="Ctrl K">⌘K</kbd>
            </button>
            <Link href="/login" className="docs-topbar-btn-ghost">Sign in</Link>
            <Link href="/signup" className="docs-topbar-btn-primary">Get started</Link>
          </div>
        </div>
      </header>

      <div className="docs-body">
        {/* ── Sidebar ── */}
        <aside className="docs-sidebar" aria-label="Documentation navigation">
          <nav>
            {SIDEBAR_GROUPS.map((group) => (
              <div key={group.label} className="docs-sidebar-group">
                <div className="docs-sidebar-group-label">{group.label}</div>
                <ul className="docs-sidebar-items">
                  {group.items.map((item) => (
                    <li key={item.id}>
                      <Link
                        href={`/docs/${item.id}`}
                        className="docs-sidebar-link"
                      >
                        {item.label}
                        {item.badge && (
                          <span
                            className={`docs-badge docs-badge-${item.badge.toLowerCase()}`}
                            aria-label={item.badge}
                          >
                            {item.badge}
                          </span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        {/* ── Main content ── */}
        <main className="docs-main" id="docs-content">
          {children}
        </main>
      </div>
    </div>
  );
}
