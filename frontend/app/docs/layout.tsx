import type { Metadata } from "next";
import Link from "next/link";
import { DocsSidebar } from "@/components/docs/DocsSidebar";
import { ShieldMark } from "@/components/shield-mark";
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
  return <ShieldMark size={24} />;
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
        <DocsSidebar />

        {/* ── Main content ── */}
        <main className="docs-main" id="docs-content">
          {children}
        </main>
      </div>
    </div>
  );
}
