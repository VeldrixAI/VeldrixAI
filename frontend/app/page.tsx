"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import "./landing.css";
import "./neural-network.css";
import { ShieldMark } from "@/components/shield-mark";
import { NAV_LINKS, FOOTER_PLATFORM_LINKS, FOOTER_DEVELOPER_LINKS, FOOTER_COMPANY_LINKS } from "@/lib/constants/nav-links";
import { PLANS } from "@/lib/constants/pricing";
import { SystemStatusBar } from "@/components/landing/SystemStatusBar";
import { TrustPipeline3D } from "@/components/landing/TrustPipeline3D";
import { EntropyMap } from "@/components/landing/EntropyMap";
import { VoronoiGuard } from "@/components/landing/VoronoiGuard";
import { ParallelStreamDecoder } from "@/components/landing/ParallelStreamDecoder";
import { InjectionDetector } from "@/components/landing/InjectionDetector";
import { BiasHeatmap } from "@/components/landing/BiasHeatmap";
import { TimeSeriesLedger } from "@/components/landing/TimeSeriesLedger";
import { PerformanceMatrix } from "@/components/landing/PerformanceMatrix";
import { NeuralTrustNetwork } from "@/components/landing/NeuralTrustNetwork";
import { motion } from "framer-motion";

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return reduced;
}

type StatusState = "operational" | "degraded" | "incident" | "unknown";

function useSystemStatus(): StatusState {
  const [status, setStatus] = useState<StatusState>("unknown");
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_VELDRIX_CORE_URL;
    if (!url) return;
    fetch(`${url}/health`, { signal: AbortSignal.timeout(4000) })
      .then((r) => setStatus(r.ok ? "operational" : "degraded"))
      .catch(() => setStatus("unknown"));
  }, []);
  return status;
}

function NavLogo() {
  return <ShieldMark size={40} />;
}

function FooterLogo() {
  return <ShieldMark size={30} />;
}

function NavBar() {
  return (
    <header className="lp-nav" role="banner">
      <nav className="lp-container lp-nav-inner" aria-label="Main navigation">
        <Link href="/" className="lp-brand" aria-label="Veldrix home">
          <div className="lp-nav-logo-box"><NavLogo /></div>
          <span className="lp-nav-wordmark">Veldrix</span>
        </Link>
        <div className="lp-nav-links" role="list">
          {NAV_LINKS.map((link) =>
            link.href.startsWith("/") || link.href.startsWith("#") ? (
              <Link key={link.label} href={link.href} role="listitem">{link.label}</Link>
            ) : (
              <a key={link.label} href={link.href} role="listitem">{link.label}</a>
            )
          )}
        </div>
        <div className="lp-nav-actions">
          <Link href="/login" className="lp-link-ghost">Login</Link>
          <Link href="/signup" className="lp-btn lp-btn-solid">Get started</Link>
        </div>
      </nav>
    </header>
  );
}

const PYTHON_CODE = `from veldrixai import Veldrix

@veldrix.guard(policy="default")
def generate_reply(prompt: str) -> str:
    return llm.complete(prompt)`;

function HeroSection({ reduced }: { reduced: boolean }) {
  return (
    <section className="lp-hero nexus-hero-section" aria-label="Hero">
      <NeuralTrustNetwork reduced={reduced} />
    </section>
  );
}

const PILLARS_DATA = [
  { id: "safety", name: "Safety · detected.", desc: "Multi-stage semantic detection with zero-shot classifiers. Catches harmful, violent, and self-harm-inducing content before it reaches your users.", Viz: VoronoiGuard },
  { id: "hallucination", name: "Hallucination · measured.", desc: "Estimates factual confidence and flags fabricated citations. Token-level probability density maps show uncertainty in real-time.", Viz: EntropyMap },
  { id: "bias", name: "Bias · audited.", desc: "Identifies discriminatory framing and demographic stereotyping. Every verdict writes to the immutable audit log for regulatory transparency.", Viz: BiasHeatmap },
  { id: "prompt-security", name: "Prompt injection · blocked.", desc: "Detects injection attacks, jailbreak attempts, and role-playing exploits. Dynamic RBAC policies inject context-aware guardrails at runtime.", Viz: InjectionDetector },
  { id: "compliance", name: "PII · masked.", desc: "Scans for personally identifiable information using regex patterns and NER models. Detected PII is automatically redacted before logging.", Viz: ParallelStreamDecoder },
];

function FivePillarsSection() {
  return (
    <section id="section-pillars" className="lp-pillars-section" aria-label="Five evaluation pillars">
      <div className="lp-container">
        <motion.h2
          className="lp-pillars-section-heading"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ stiffness: 300, damping: 30 }}
        >
          Five pillars. Every response.
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1, stiffness: 300, damping: 30 }}
          style={{ fontFamily: "var(--font-body)", fontSize: "1rem", color: "rgba(231,236,239,0.5)", maxWidth: "52ch", marginBottom: "64px", lineHeight: 1.7 }}
        >
          Veldrix runs five parallel evaluations on every LLM response. Any pillar can trigger enforcement. All verdicts write to the audit log.
        </motion.p>
        <div>
          {PILLARS_DATA.map((pillar, i) => (
            <motion.div
              key={pillar.id}
              initial={{ opacity: 0, x: i % 2 === 0 ? -40 : 40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ delay: i * 0.1, stiffness: 300, damping: 30 }}
            >
              {i > 0 && <div className="lp-section-divider" style={{ marginBottom: 0 }} />}
              <div className="lp-pillar-strip" style={{ flexDirection: i % 2 !== 0 ? "row-reverse" : "row" }}>
                <div className="lp-pillar-strip-copy">
                  <h3 className="lp-pillar-name">{pillar.name}</h3>
                  <p className="lp-pillar-desc">{pillar.desc}</p>
                </div>
                <div className="lp-pillar-strip-visual">
                  {pillar.Viz ? <pillar.Viz /> : (
                    <svg width="100%" height="160" viewBox="0 0 240 160" aria-hidden="true">
                      <rect x="20" y="20" width="200" height="120" rx="8" fill="rgba(255,255,255,0.02)" stroke="rgba(255,255,255,0.06)" />
                      <text x="120" y="85" fontSize="10" fill="rgba(231,236,239,0.2)" textAnchor="middle" fontFamily="JetBrains Mono, monospace">VISUALIZATION</text>
                    </svg>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function AuditLogSection() {
  return (
    <section id="section-audit" className="lp-audit-section" aria-label="Audit log">
      <div className="lp-container">
        <motion.h2
          className="lp-audit-section-heading"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ stiffness: 300, damping: 30 }}
        >
          Append-only. Cryptographically signed.
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1, stiffness: 300, damping: 30 }}
          style={{ fontFamily: "var(--font-body)", fontSize: "1rem", color: "rgba(231,236,239,0.5)", maxWidth: "52ch", marginBottom: "48px", lineHeight: 1.7 }}
        >
          Every evaluation writes an immutable audit entry. SOC 2 ready out of the box — hand the log to your auditor without modification.
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2, stiffness: 300, damping: 30 }}
        >
          <TimeSeriesLedger />
        </motion.div>
      </div>
    </section>
  );
}

function LatencyReceiptSection() {
  return (
    <section id="section-latency" className="lp-latency-section" aria-label="Latency benchmark">
      <div className="lp-container">
        <motion.h2
          className="lp-latency-section-heading"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ stiffness: 300, damping: 30 }}
        >
          Real numbers. No superlatives.
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1, stiffness: 300, damping: 30 }}
          className="lp-latency-sub"
        >
          Measured against our own production workload. Sub-500ms Veldrix overhead shown as the violet slice.
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2, stiffness: 300, damping: 30 }}
        >
          <PerformanceMatrix />
        </motion.div>
      </div>
    </section>
  );
}

const VISIBLE_PLANS = PLANS.filter((p) => p.id !== "enterprise");

function SimplePricingSection() {
  return (
    <section id="pricing" className="lp-pricing-section" aria-label="Pricing">
      <div className="lp-container">
        <motion.h2
          className="lp-pricing-heading"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ stiffness: 300, damping: 30 }}
        >
          Simple, honest pricing.
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1, stiffness: 300, damping: 30 }}
          className="lp-pricing-sub"
        >
          One price, billed monthly. Start with a 14-day free trial on any paid plan — no credit card required.
        </motion.p>
        <div className="lp-pricing-cards">
          {VISIBLE_PLANS.map((plan, i) => {
            const featured = plan.highlight;
            return (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1, stiffness: 300, damping: 30 }}
                className={`lp-plan-card ${featured ? "featured" : ""}`}
              >
                <div className="lp-plan-name-row">
                  <span className="lp-plan-title">{plan.name}</span>
                </div>
                <div>
                  {plan.monthlyPrice === 0 ? (
                    <div className="lp-plan-price-val">Free</div>
                  ) : (
                    <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                      <span style={{ fontSize: "1.125rem", color: "rgba(231,236,239,0.4)", fontWeight: 400 }}>$</span>
                      <span className="lp-plan-price-val">{plan.monthlyPrice}</span>
                      <span className="lp-plan-price-mo">/mo</span>
                    </div>
                  )}
                  <div className="lp-plan-vol">{plan.evaluationsPerMonth} evals/month</div>
                </div>
                <a href={plan.ctaHref} className={`lp-plan-cta-link ${featured ? "featured-cta" : ""}`}>
                  {plan.cta}
                </a>
              </motion.div>
            );
          })}
        </div>
        <p className="lp-enterprise-line">
          Air-gapped deployment, custom policies, dedicated support:{" "}
          <a href="mailto:sales@veldrixai.ca">sales@veldrixai.ca</a>
        </p>
      </div>
    </section>
  );
}

function FooterSection() {
  const status = useSystemStatus();
  return (
    <footer className="lp-footer" role="contentinfo">
      <div className="lp-footer-inner">
        <div>
          <Link href="/" className="lp-footer-brand-logo" aria-label="Veldrix home">
            <div className="lp-footer-logo-box"><FooterLogo /></div>
            <span className="lp-footer-wordmark">Veldrix</span>
          </Link>
          <p className="lp-footer-tagline">
            Runtime evaluation for production AI. Five pillars. Sub-500ms. An audit trail your compliance team will accept.
          </p>
        </div>
        <div className="lp-footer-links-grid">
          <div>
            <div className="lp-footer-col-title">Product</div>
            <ul className="lp-footer-links">
              {FOOTER_PLATFORM_LINKS.map((l) => (
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
                  {l.href.startsWith("mailto:") ? <a href={l.href}>{l.label}</a> : <Link href={l.href}>{l.label}</Link>}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      <div className="lp-footer-bottom">
        <span>© 2026 Veldrix Inc. · Toronto</span>
        <div className="lp-status-indicator">
          <span className="lp-status-dot" aria-hidden="true" />
          <span>All systems operational</span>
        </div>
      </div>
    </footer>
  );
}

export default function LandingPage() {
  const reduced = usePrefersReducedMotion();

  return (
    <>
      <div className="lp-noise" aria-hidden="true" />
      <NavBar />
      <SystemStatusBar />
      <main className="lp-main" id="main-content">
        <HeroSection reduced={reduced} />
        <div className="lp-section-divider" />
        <FivePillarsSection />
        <div className="lp-section-divider" />
        <AuditLogSection />
        <div className="lp-section-divider" />
        <LatencyReceiptSection />
        <div className="lp-section-divider" />
        <SimplePricingSection />
      </main>
      <FooterSection />
    </>
  );
}
