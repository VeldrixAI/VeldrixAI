"use client";

import Link from "next/link";
import "./landing.css";
import PricingSection from "@/components/landing/PricingSection";
import {
  NAV_LINKS,
  FOOTER_PLATFORM_LINKS,
  FOOTER_COMPLIANCE_LINKS,
  FOOTER_DEVELOPER_LINKS,
  FOOTER_COMPANY_LINKS,
} from "@/lib/constants/nav-links";
import { TRUST_PILLARS, GOVERNANCE_FEATURES, SCALE_FEATURES } from "@/lib/constants/product-features";
import { PRODUCT_STATS } from "@/lib/constants/product-stats";

// ── Auth check ───────────────────────────────────────────────────────────────
function checkAuth(): boolean {
  return document.cookie.includes("veldrix_session");
}

// ── Canonical brand mark — navbar (full mark, unique IDs) ────────────────────
function NavLogo() {
  return (
    <svg width="22" height="22" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="vg1-nav" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#c4b5fd"/>
          <stop offset="50%" stopColor="#818cf8"/>
          <stop offset="100%" stopColor="#67e8f9"/>
        </linearGradient>
        <linearGradient id="vg2-nav" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95"/>
          <stop offset="100%" stopColor="#a78bfa"/>
        </linearGradient>
        <linearGradient id="sq-nav" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.4"/>
          <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.2"/>
        </linearGradient>
        <filter id="fg-nav">
          <feGaussianBlur stdDeviation="2.5" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="fg2-nav">
          <feGaussianBlur stdDeviation="1.5" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <rect x="8" y="8" width="84" height="84" rx="18" fill="url(#sq-nav)" stroke="url(#vg1-nav)" strokeWidth="1"/>
      <path d="M50 18 L82 50 L50 82 L18 50 Z" fill="none" stroke="url(#vg1-nav)" strokeWidth="0.8" strokeOpacity="0.3"/>
      <path d="M24 30 L50 70 L76 30" fill="none" stroke="url(#vg2-nav)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" filter="url(#fg-nav)"/>
      <circle cx="50" cy="70" r="5" fill="url(#vg1-nav)" filter="url(#fg2-nav)"/>
      <circle cx="50" cy="70" r="2.5" fill="white" opacity="0.9"/>
      <rect x="30" y="47" width="14" height="2.5" rx="1.25" fill="#a78bfa" opacity="0.6"/>
      <rect x="56" y="47" width="14" height="2.5" rx="1.25" fill="#67e8f9" opacity="0.6"/>
      <line x1="50" y1="8" x2="50" y2="16" stroke="#c4b5fd" strokeWidth="2" strokeLinecap="round" opacity="0.5"/>
    </svg>
  );
}

// ── Simplified V-only variant — hero dashboard card icon ─────────────────────
function HeroCardIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="vg-hero-icon" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95"/>
          <stop offset="100%" stopColor="#e9d5ff"/>
        </linearGradient>
      </defs>
      <path d="M24 30 L50 70 L76 30" fill="none" stroke="url(#vg-hero-icon)" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="50" cy="70" r="7" fill="#67e8f9"/>
      <circle cx="50" cy="70" r="3.5" fill="white"/>
    </svg>
  );
}

// ── Canonical brand mark — footer (full mark, unique IDs) ────────────────────
function FooterLogo() {
  return (
    <svg width="16" height="16" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="vg1-ft" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#c4b5fd"/>
          <stop offset="50%" stopColor="#818cf8"/>
          <stop offset="100%" stopColor="#67e8f9"/>
        </linearGradient>
        <linearGradient id="vg2-ft" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95"/>
          <stop offset="100%" stopColor="#a78bfa"/>
        </linearGradient>
        <linearGradient id="sq-ft" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.4"/>
          <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.2"/>
        </linearGradient>
        <filter id="fg-ft">
          <feGaussianBlur stdDeviation="2.5" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="fg2-ft">
          <feGaussianBlur stdDeviation="1.5" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <rect x="8" y="8" width="84" height="84" rx="18" fill="url(#sq-ft)" stroke="url(#vg1-ft)" strokeWidth="1"/>
      <path d="M50 18 L82 50 L50 82 L18 50 Z" fill="none" stroke="url(#vg1-ft)" strokeWidth="0.8" strokeOpacity="0.3"/>
      <path d="M24 30 L50 70 L76 30" fill="none" stroke="url(#vg2-ft)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" filter="url(#fg-ft)"/>
      <circle cx="50" cy="70" r="5" fill="url(#vg1-ft)" filter="url(#fg2-ft)"/>
      <circle cx="50" cy="70" r="2.5" fill="white" opacity="0.9"/>
      <rect x="30" y="47" width="14" height="2.5" rx="1.25" fill="#a78bfa" opacity="0.6"/>
      <rect x="56" y="47" width="14" height="2.5" rx="1.25" fill="#67e8f9" opacity="0.6"/>
      <line x1="50" y1="8" x2="50" y2="16" stroke="#c4b5fd" strokeWidth="2" strokeLinecap="round" opacity="0.5"/>
    </svg>
  );
}

// ── Pillar icon map ───────────────────────────────────────────────────────────
function PillarIcon({ id }: { id: string }) {
  switch (id) {
    case "safety":
      return (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
      );
    case "hallucination":
      return (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M9 12l2 2 4-4"/><path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"/>
        </svg>
      );
    case "bias":
      return (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
        </svg>
      );
    case "prompt-security":
      return (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M3 6h18M3 12h18M3 18h18"/>
          <circle cx="7" cy="6" r="1" fill="currentColor"/>
          <circle cx="7" cy="12" r="1" fill="currentColor"/>
          <circle cx="7" cy="18" r="1" fill="currentColor"/>
        </svg>
      );
    case "compliance":
      return (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>
        </svg>
      );
    default:
      return null;
  }
}

const PILLAR_COLOR_CLASS: Record<string, string> = {
  safety: "lp-pillar-violet",
  hallucination: "lp-pillar-emerald",
  bias: "lp-pillar-violet",
  "prompt-security": "lp-pillar-indigo",
  compliance: "lp-pillar-rose",
};

const PILLAR_ANIM_CLASS = ["p1", "p2", "p3", "p4", "p5"];

// ── Main component ───────────────────────────────────────────────────────────
export default function LandingPage() {
  // checkAuth is used by the get-started CTA — not rendered on server
  void checkAuth;

  return (
    <>
      {/* ── Ambient background ── */}
      <div className="lp-orb lp-orb-1" />
      <div className="lp-orb lp-orb-2" />
      <div className="lp-orb lp-orb-3" />
      <div className="lp-noise" />

      {/* ══════════ NAVBAR ══════════ */}
      <header className="lp-nav">
        <nav className="lp-nav-inner" aria-label="Main navigation">
          <Link href="/" className="lp-nav-brand" aria-label="VeldrixAI home">
            <div className="lp-nav-logo-box">
              <NavLogo />
            </div>
            <div className="lp-nav-wordmark">
              Veldrix<span className="shimmer-text">AI</span>
            </div>
          </Link>

          <div className="lp-nav-links">
            {NAV_LINKS.map((link) => (
              link.href.startsWith("/") ? (
                <Link key={link.label} href={link.href} className={link.label === "Products" ? "lp-nav-link-active" : undefined}>
                  {link.label}
                </Link>
              ) : (
                <a key={link.label} href={link.href}>
                  {link.label}
                </a>
              )
            ))}
          </div>

          <div className="lp-nav-actions">
            <Link href="/login" className="lp-btn-ghost">Login</Link>
            <Link href="/signup" className="lp-btn-primary">Get Started</Link>
          </div>
        </nav>
      </header>

      <main className="lp-main mesh-gradient">

        {/* ══════════ HERO ══════════ */}
        <section className="lp-hero section-reveal" aria-label="Hero">
          <div className="lp-hero-bg" />
          <div className="lp-container">
            <div className="lp-hero-grid">

              {/* Left copy */}
              <div>
                <div className="lp-hero-badge">
                  <div className="lp-hero-badge-dot-wrap">
                    <span className="lp-ping" />
                    <span className="lp-live-dot" />
                  </div>
                  <span className="lp-hero-badge-text">
                    Runtime Trust Infrastructure · v3.1
                  </span>
                </div>

                <h1 className="lp-hero-h1">
                  The Immutable <br />
                  <span className="shimmer-text">Trust Protocol</span>
                  <br />
                  for Enterprise
                </h1>

                <p className="lp-hero-p">
                  VeldrixAI is the strategic defense layer between LLM logic and
                  production reality. Deploy high-fidelity AI with guaranteed
                  compliance, absolute auditability, and zero hallucination risk.
                </p>

                <div className="lp-hero-ctas">
                  <Link href="/signup" className="lp-btn-hero-primary">
                    Secure Your AI Now
                  </Link>
                  <Link href="/docs" className="lp-btn-hero-secondary">
                    Read the Docs
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M7 17L17 7M17 7H7M17 7V17"/>
                    </svg>
                  </Link>
                </div>
              </div>

              {/* Right — Animated Dashboard Card */}
              <div>
                <div className="lp-dash-wrap animate-float">
                  <div className="lp-dash-glow" />
                  <div className="lp-dash-card animate-scan">

                    <div className="lp-dash-header">
                      <div>
                        <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#7c3aed', fontWeight: 900, display: 'block', marginBottom: '4px', fontFamily: 'var(--font-display)' }}>
                          Live Trust Metrics
                        </span>
                        <span style={{ fontSize: '1.25rem', fontFamily: 'var(--font-display)', fontWeight: 700 }}>
                          Audit Intelligence
                        </span>
                      </div>
                      <div className="lp-dash-icon-box">
                        <HeroCardIcon />
                      </div>
                    </div>

                    {/* Stats driven from PRODUCT_STATS */}
                    <div className="lp-stats-grid">
                      <div className="lp-stat-box stat-reveal" style={{ animationDelay: '0.3s' }}>
                        <span className="lp-stat-label">{PRODUCT_STATS[2].label}</span>
                        <div className="lp-stat-value" style={{ color: '#10b981' }}>{PRODUCT_STATS[2].value}</div>
                      </div>
                      <div className="lp-stat-box stat-reveal" style={{ animationDelay: '0.45s' }}>
                        <span className="lp-stat-label">{PRODUCT_STATS[3].label}</span>
                        <div className="lp-stat-value" style={{ color: '#f0f2ff' }}>{PRODUCT_STATS[3].value}</div>
                      </div>
                    </div>

                    {/* Bar chart */}
                    <div className="lp-bar-section">
                      <div className="lp-bar-header">
                        <span className="lp-bar-label">Global Traffic Velocity</span>
                        <span className="lp-bar-stat">+14.2%</span>
                      </div>
                      <div className="lp-bar-chart">
                        <div className="lp-bar bar-animate bar-1" style={{ height: '40%', background: 'rgba(255,255,255,0.05)' }} />
                        <div className="lp-bar bar-animate bar-2" style={{ height: '60%', background: 'rgba(255,255,255,0.05)' }} />
                        <div className="lp-bar bar-animate bar-3" style={{ height: '45%', background: 'rgba(255,255,255,0.05)' }} />
                        <div className="lp-bar bar-animate bar-4" style={{ height: '75%', background: 'rgba(255,255,255,0.10)' }} />
                        <div className="lp-bar bar-animate bar-5" style={{ height: '90%', background: 'rgba(255,255,255,0.20)' }} />
                        <div className="lp-bar bar-animate bar-6 primary-gradient" style={{ height: '100%' }} />
                        <div className="lp-bar bar-animate bar-7" style={{ height: '65%', background: 'rgba(255,255,255,0.10)' }} />
                      </div>
                    </div>

                    {/* Live feed */}
                    <div className="lp-live-row">
                      <div className="lp-live-dot" />
                      <span style={{ color: 'rgba(240,242,255,0.5)', fontWeight: 500 }}>Session Intercepted:</span>
                      <span style={{ fontWeight: 700, color: 'white', fontFamily: 'var(--font-mono)', letterSpacing: '0.05em' }}>
                        PII_REDACTED
                      </span>
                    </div>

                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ══════════ TRUST BADGES ══════════ */}
        <section className="lp-badges section-reveal" aria-label="Certifications">
          <div className="lp-container">
            <div className="lp-badges-row">
              <div className="lp-badge-item">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>
                </svg>
                <span className="lp-badge-name">SOC2 Type II</span>
              </div>
              <div className="lp-badge-item">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
                <span className="lp-badge-name">ISO 27001</span>
              </div>
              <div className="lp-badge-item">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
                </svg>
                <span className="lp-badge-name">NVIDIA Elite Partner</span>
              </div>
              <div className="lp-badge-item">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>
                </svg>
                <span className="lp-badge-name">GDPR Certified</span>
              </div>
            </div>
          </div>
        </section>

        {/* ══════════ FIVE PILLARS ══════════ */}
        <section id="pillars" className="lp-pillars section-reveal" aria-label="Trust Pillars">
          <div style={{ position: 'absolute', top: 0, right: 0, width: '33%', height: '100%', filter: 'blur(120px)', borderRadius: '50%', background: 'rgba(124,58,237,0.06)', pointerEvents: 'none' }} />
          <div className="lp-container">
            <div className="lp-pillars-header">
              <div style={{ maxWidth: '48rem' }}>
                <div className="lp-eyebrow">Architecture</div>
                <h2 className="lp-h2">
                  The Five Pillars of <br />
                  <span className="shimmer-text">Absolute Governance</span>
                </h2>
                <p className="lp-p">
                  VeldrixAI&apos;s proprietary infrastructure utilizes NVIDIA-optimized tensor cores to
                  ensure every token of enterprise intelligence is audited before it leaves your perimeter.
                </p>
              </div>
              <Link href="/docs/trust-overview" style={{ color: '#7c3aed', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none', fontSize: '1rem', whiteSpace: 'nowrap', transition: 'gap 0.2s' }}>
                Explore Technical Specs
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
              </Link>
            </div>

            <div className="lp-pillars-grid">
              {TRUST_PILLARS.map((pillar, i) => (
                <div
                  key={pillar.id}
                  className={`lp-pillar ${PILLAR_COLOR_CLASS[pillar.id]} pillar-card ${PILLAR_ANIM_CLASS[i]}`}
                >
                  <div className="lp-pillar-icon">
                    <PillarIcon id={pillar.id} />
                  </div>
                  <h3 className="lp-pillar-title">{pillar.displayName}</h3>
                  <p className="lp-pillar-desc">{pillar.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ══════════ GOVERNANCE DASHBOARD ══════════ */}
        <section id="governance" className="lp-gov section-reveal" aria-label="Governance Dashboard">
          <div className="lp-container">
            <div className="lp-gov-inner">

              {/* Left copy */}
              <div className="lp-gov-copy">
                <div className="lp-eyebrow" style={{ color: '#10b981' }}>Control Plane</div>
                <h2 className="lp-h2">
                  Total Observability<br />over AI Behavior
                </h2>
                <p className="lp-p" style={{ marginBottom: '3rem', fontSize: '1.25rem' }}>
                  Don&apos;t operate in the dark. VeldrixAI provides a sub-millisecond latency console to
                  monitor, filter, and audit every interaction between your users and your models.
                </p>

                {GOVERNANCE_FEATURES.map((feat) => (
                  <div key={feat.title} className="lp-feature-item">
                    <div className="lp-feature-icon-box" style={{ color: feat.color }}>
                      {feat.title === "High-Fidelity Log Streams" ? (
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path d="M3 3v18h18"/><rect x="7" y="10" width="3" height="8"/><rect x="12" y="6" width="3" height="12"/><rect x="17" y="8" width="3" height="10"/>
                        </svg>
                      ) : (
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>
                        </svg>
                      )}
                    </div>
                    <div>
                      <h4 className="lp-feature-title">{feat.title}</h4>
                      <p className="lp-feature-desc">{feat.description}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Right — Live Audit Table */}
              <div className="lp-gov-table-col">
                <div style={{ position: 'absolute', inset: 0, filter: 'blur(100px)', borderRadius: '50%', background: 'rgba(124,58,237,0.08)', pointerEvents: 'none' }} />
                <div className="lp-audit-card">
                  <div className="lp-audit-hdr">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div className="lp-live-dot" />
                      <span className="lp-audit-hdr-label">Live Sovereign Stream</span>
                    </div>
                    <span className="lp-audit-hdr-ver">v3.1 PRO</span>
                  </div>

                  <table className="lp-audit-table">
                    <thead>
                      <tr>
                        <th>Principal ID</th>
                        <th>Status</th>
                        <th>Val Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="row-reveal row-1">
                        <td>
                          <div className="lp-id-cell">
                            <div className="lp-id-dot" style={{ background: '#10b981' }} />
                            <span className="lp-id-text">user_8821_exec</span>
                          </div>
                        </td>
                        <td>
                          <span className="lp-status-badge" style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981', borderColor: 'rgba(16,185,129,0.2)' }}>PASSED</span>
                        </td>
                        <td>
                          <div className="lp-val-cell">
                            <div className="lp-val-track">
                              <div className="lp-val-fill" style={{ width: '98%', background: '#10b981' }} />
                            </div>
                            <span className="lp-val-score" style={{ color: '#10b981' }}>0.98</span>
                          </div>
                        </td>
                      </tr>
                      <tr className="row-reveal row-2">
                        <td>
                          <div className="lp-id-cell">
                            <div className="lp-id-dot" style={{ background: '#f43f5e' }} />
                            <span className="lp-id-text">svc_auth_node</span>
                          </div>
                        </td>
                        <td>
                          <span className="lp-status-badge" style={{ background: 'rgba(244,63,94,0.1)', color: '#f43f5e', borderColor: 'rgba(244,63,94,0.2)' }}>INTERCEPTED</span>
                        </td>
                        <td>
                          <div className="lp-val-cell">
                            <div className="lp-val-track">
                              <div className="lp-val-fill" style={{ width: '12%', background: '#f43f5e' }} />
                            </div>
                            <span className="lp-val-score" style={{ color: '#f43f5e' }}>0.12</span>
                          </div>
                        </td>
                      </tr>
                      <tr className="row-reveal row-3">
                        <td>
                          <div className="lp-id-cell">
                            <div className="lp-id-dot" style={{ background: '#f59e0b' }} />
                            <span className="lp-id-text">user_1109_dev</span>
                          </div>
                        </td>
                        <td>
                          <span className="lp-status-badge" style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b', borderColor: 'rgba(245,158,11,0.2)' }}>FLAGGED</span>
                        </td>
                        <td>
                          <div className="lp-val-cell">
                            <div className="lp-val-track">
                              <div className="lp-val-fill" style={{ width: '64%', background: '#f59e0b' }} />
                            </div>
                            <span className="lp-val-score" style={{ color: '#f59e0b' }}>0.64</span>
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  <div className="lp-audit-footer">
                    <Link href="/dashboard/audit-trails">View All Audit Intelligence</Link>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </section>

        {/* ══════════ USAGE TRACKER ══════════ */}
        <section className="lp-usage section-reveal" aria-label="Usage and Scale">
          <div className="lp-container">
            <div className="lp-usage-grid">

              {/* Usage card */}
              <div style={{ order: 2, position: 'relative' }}>
                <div style={{ position: 'absolute', inset: '-2.5rem', filter: 'blur(120px)', borderRadius: '50%', background: 'rgba(124,58,237,0.08)', pointerEvents: 'none' }} />
                <div className="lp-usage-card">
                  <div className="lp-usage-card-header">
                    <div>
                      <div className="lp-usage-card-title">Request Tracker</div>
                      <div className="lp-usage-card-sub">Resource Consumption</div>
                    </div>
                    <span className="lp-status-badge" style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981', borderColor: 'rgba(16,185,129,0.2)', fontSize: '10px' }}>
                      System Healthy
                    </span>
                  </div>

                  <div className="lp-usage-body">
                    <div className="lp-gauge-wrap">
                      <div className="lp-gauge trust-gauge">
                        <div className="lp-gauge-inner">
                          <span className="lp-gauge-value">68%</span>
                          <span className="lp-gauge-label">Capacity</span>
                        </div>
                      </div>
                    </div>

                    <div className="lp-usage-stats">
                      <div className="lp-usage-stat-label">Total Enterprise Audit Requests</div>
                      <div>
                        <span className="lp-usage-stat-num stat-reveal" style={{ animationDelay: '0.6s' }}>342</span>
                        <span className="lp-usage-stat-denom">/500</span>
                      </div>
                      <Link href="/signup" className="lp-usage-btn">Increase Monthly Limit</Link>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right copy */}
              <div style={{ order: 1 }}>
                <div className="lp-eyebrow">Strategic Governance</div>
                <h2 className="lp-h2">
                  Scale Trust Across <span className="shimmer-text">Every Node</span>
                </h2>
                <p className="lp-p" style={{ fontSize: '1.25rem', marginBottom: '0' }}>
                  VeldrixAI doesn&apos;t just block; it illuminates. Quantify your AI governance posture
                  with dashboard-ready reports designed for executive-level transparency.
                </p>
                <ul className="lp-checklist">
                  {SCALE_FEATURES.map((item) => (
                    <li key={item}>
                      <div className="lp-check-icon">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                          <path d="M20 6L9 17l-5-5"/>
                        </svg>
                      </div>
                      <span className="lp-checklist-text">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

            </div>
          </div>
        </section>

        {/* ══════════ PRICING ══════════ */}
        <PricingSection />

        {/* ══════════ CTA ══════════ */}
        <section className="lp-cta section-reveal" aria-label="Call to action">
          <div className="lp-cta-border">
            <div className="lp-cta-glow-tl" />
            <div className="lp-cta-inner mesh-gradient">
              <div style={{ position: 'relative', zIndex: 10 }}>
                <h2 className="lp-cta-h2">
                  The Future of AI is <br />
                  <span className="shimmer-text">Governed.</span>
                </h2>
                <p className="lp-cta-p">
                  Join the world&apos;s most resilient enterprises. Secure your intellectual property and
                  human capital with VeldrixAI. Deploy without fear.
                </p>
                <div className="lp-cta-btns">
                  <Link href="/signup" className="lp-btn-cta-primary">
                    Request Sovereign Access
                  </Link>
                  <a href="mailto:sales@veldrixai.ca" className="lp-btn-cta-secondary">
                    Speak with Security Lead
                  </a>
                </div>
                <p className="lp-cta-footnote">
                  Immediate Provisioning Available for Azure &amp; AWS Tenants
                </p>
              </div>
            </div>
          </div>
        </section>

      </main>

      {/* ══════════ FOOTER ══════════ */}
      <footer className="lp-footer">
        <div className="lp-footer-inner">
          {/* Brand column */}
          <div className="lp-footer-brand">
            <div className="lp-footer-logo-row">
              <div className="lp-footer-logo-box">
                <FooterLogo />
              </div>
              <div className="lp-footer-wordmark">
                Veldrix<span className="shimmer-text">AI</span>
              </div>
            </div>
            <p>
              The global standard for sovereign AI governance. Built on the Veldrix
              Trust Protocol to protect enterprise intelligence in a post-generative era.
            </p>
            <p style={{ marginTop: '1rem', fontSize: '12px', color: 'rgba(240,242,255,0.35)' }}>
              <a href="mailto:support@veldrixai.ca" style={{ color: 'inherit', textDecoration: 'none' }}>support@veldrixai.ca</a>
              {' · '}
              <a href="mailto:security@veldrixai.ca" style={{ color: 'inherit', textDecoration: 'none' }}>security@veldrixai.ca</a>
            </p>
          </div>

          {/* Link columns */}
          <div className="lp-footer-links-grid">
            <div>
              <div className="lp-footer-col-title">Platform</div>
              <ul className="lp-footer-links">
                {FOOTER_PLATFORM_LINKS.map((l) => (
                  <li key={l.label}><Link href={l.href}>{l.label}</Link></li>
                ))}
              </ul>
            </div>
            <div>
              <div className="lp-footer-col-title">Compliance</div>
              <ul className="lp-footer-links">
                {FOOTER_COMPLIANCE_LINKS.map((l) => (
                  <li key={l.label}><Link href={l.href}>{l.label}</Link></li>
                ))}
              </ul>
            </div>
            <div>
              <div className="lp-footer-col-title">Developers</div>
              <ul className="lp-footer-links">
                {FOOTER_DEVELOPER_LINKS.map((l) => (
                  <li key={l.label}><Link href={l.href}>{l.label}</Link></li>
                ))}
              </ul>
            </div>
            <div>
              <div className="lp-footer-col-title">Company</div>
              <ul className="lp-footer-links">
                {FOOTER_COMPANY_LINKS.map((l) => (
                  <li key={l.label}>
                    {l.href.startsWith("mailto:") ? (
                      <a href={l.href}>{l.label}</a>
                    ) : (
                      <Link href={l.href}>{l.label}</Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="lp-footer-bottom">
          <span>© 2026 VeldrixAI. All rights reserved.</span>
          <span>Built for AI teams who ship responsibly.</span>
        </div>
      </footer>
    </>
  );
}
