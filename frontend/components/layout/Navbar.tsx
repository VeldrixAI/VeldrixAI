"use client";

import { useState, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";

// ── Logo ─────────────────────────────────────────────────────────────────────
function VeldrixLogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="nav-vg" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95"/>
          <stop offset="100%" stopColor="#a78bfa"/>
        </linearGradient>
        <linearGradient id="nav-bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.35"/>
          <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.18"/>
        </linearGradient>
      </defs>
      <rect x="8" y="8" width="84" height="84" rx="18" fill="url(#nav-bg)" stroke="#7c3aed" strokeWidth="1" strokeOpacity="0.5"/>
      <path d="M24 30 L50 70 L76 30" fill="none" stroke="url(#nav-vg)" strokeWidth="7.5" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="50" cy="70" r="5" fill="#06b6d4"/>
      <circle cx="50" cy="70" r="2.5" fill="white"/>
      <rect x="30" y="47" width="12" height="2.5" rx="1.25" fill="#a78bfa" opacity="0.65"/>
      <rect x="58" y="47" width="12" height="2.5" rx="1.25" fill="#67e8f9" opacity="0.65"/>
    </svg>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface User {
  id: string;
  email: string;
  role: string;
  is_active: boolean;
}

// ── Main Navbar ───────────────────────────────────────────────────────────────
export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileProductOpen, setMobileProductOpen] = useState(false);
  const [mobileSolutionsOpen, setMobileSolutionsOpen] = useState(false);
  const [showAnnouncement, setShowAnnouncement] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [avatarDropdown, setAvatarDropdown] = useState(false);
  const [logoHovered, setLogoHovered] = useState(false);

  const showTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hideTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const avatarShowTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const avatarHideTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Inject keyframe animations
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes navReveal { from { opacity: 0; transform: translateY(-12px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes menuReveal { from { opacity: 0; transform: translateY(-8px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
      @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
      @keyframes drawerSlideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
      @keyframes drawerSlideOut { from { transform: translateX(0); } to { transform: translateX(100%); } }
    `;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  // Scroll listener
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY >= 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Auth check
  useEffect(() => {
    fetch('/api/auth/me')
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data && data.email) setUser(data); })
      .catch(() => {});
  }, []);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Mega-menu hover handlers
  const handleMenuEnter = (menu: string) => {
    clearTimeout(hideTimeout.current);
    showTimeout.current = setTimeout(() => setActiveMenu(menu), 180);
  };
  const handleMenuLeave = () => {
    clearTimeout(showTimeout.current);
    hideTimeout.current = setTimeout(() => setActiveMenu(null), 150);
  };

  // Avatar dropdown handlers
  const handleAvatarEnter = () => {
    clearTimeout(avatarHideTimeout.current);
    avatarShowTimeout.current = setTimeout(() => setAvatarDropdown(true), 120);
  };
  const handleAvatarLeave = () => {
    clearTimeout(avatarShowTimeout.current);
    avatarHideTimeout.current = setTimeout(() => setAvatarDropdown(false), 200);
  };

  // Sign out
  const handleSignOut = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    router.push('/');
  };

  // Nav link style helper
  const navLinkStyle = (href: string): React.CSSProperties => ({
    fontFamily: 'var(--font-body)',
    fontSize: '14.5px',
    color: pathname === href ? 'rgba(240,242,255,0.95)' : 'rgba(240,242,255,0.65)',
    padding: '6px 14px',
    borderRadius: '8px',
    textDecoration: 'none',
    transition: 'color 200ms, background 200ms',
    borderBottom: pathname === href ? '2px solid #7c3aed' : '2px solid transparent',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    cursor: 'pointer',
    background: 'none',
    border: 'none',
  });

  return (
    <>
      {/* Announcement Bar */}
      {showAnnouncement && (
        <div style={{
          background: 'linear-gradient(90deg, rgba(76,29,149,0.5), rgba(49,46,129,0.5), rgba(8,51,68,0.4))',
          borderBottom: '1px solid rgba(124,58,237,0.2)',
          padding: '10px 24px',
          position: 'relative',
          zIndex: 50,
        }}>
          <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#67e8f9', animation: 'pulse 2s infinite' }} />
            <span style={{ fontSize: 13, color: 'rgba(240,242,255,0.8)', fontFamily: 'var(--font-body)' }}>
              🚀 VeldrixAI v1.0 is live — Runtime Trust Infrastructure for AI Systems
            </span>
            <a href="/changelog" style={{ fontSize: 13, color: '#06b6d4', textDecoration: 'underline', fontWeight: 500 }}>See what&apos;s new →</a>
            <button
              onClick={() => setShowAnnouncement(false)}
              style={{ position: 'absolute', right: 16, fontSize: 20, color: 'rgba(240,242,255,0.4)', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1 }}
            >×</button>
          </div>
        </div>
      )}

      {/* Main Navbar */}
      <nav style={{
        position: 'fixed',
        top: showAnnouncement ? 41 : 0,
        left: 0,
        right: 0,
        zIndex: 50,
        height: 68,
        background: scrolled ? 'rgba(5,8,16,0.85)' : 'transparent',
        borderBottom: scrolled ? '1px solid rgba(255,255,255,0.07)' : '1px solid transparent',
        backdropFilter: scrolled ? 'blur(24px) saturate(180%)' : 'none',
        transition: 'background 300ms, border-color 300ms, backdrop-filter 300ms',
        animation: 'navReveal 0.6s cubic-bezier(0.16,1,0.3,1) 0.1s both',
      }}>
        <div style={{
          maxWidth: 1280,
          margin: '0 auto',
          padding: '0 24px',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          {/* Logo */}
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
            <div
              onMouseEnter={() => setLogoHovered(true)}
              onMouseLeave={() => setLogoHovered(false)}
              style={{
                filter: logoHovered ? 'drop-shadow(0 0 8px rgba(124,58,237,0.6))' : 'none',
                transition: 'filter 200ms',
                display: 'flex',
              }}
            >
              <VeldrixLogoMark size={32} />
            </div>
            <span style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 800,
              fontSize: '17px',
              background: 'linear-gradient(135deg, #fff 0%, #a78bfa 60%, #67e8f9 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>VeldrixAI</span>
          </Link>

          {/* Desktop Nav Links */}
          <div style={{
            display: 'none',
            alignItems: 'center',
            gap: 2,
            // override display for md+
          }} className="navbar-desktop-links">
            {/* Product */}
            <div
              style={{ position: 'relative' }}
              onMouseEnter={() => handleMenuEnter('product')}
              onMouseLeave={handleMenuLeave}
            >
              <button style={{
                ...navLinkStyle('/product') as React.CSSProperties,
                background: activeMenu === 'product' ? 'rgba(255,255,255,0.05)' : 'none',
                color: activeMenu === 'product' ? 'rgba(240,242,255,0.95)' : 'rgba(240,242,255,0.65)',
              }}>
                Product <span style={{ fontSize: 10, opacity: 0.7 }}>▾</span>
              </button>

              {/* Product Mega-Menu */}
              {activeMenu === 'product' && (
                <div style={{
                  position: 'absolute',
                  top: 'calc(100% + 8px)',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: 580,
                  background: 'rgba(8,13,26,0.97)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 20,
                  backdropFilter: 'blur(40px)',
                  boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
                  padding: 24,
                  animation: 'menuReveal 220ms ease-out both',
                  zIndex: 60,
                }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                    {/* Column 1 */}
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: 'rgba(240,242,255,0.35)', fontFamily: 'var(--font-body)', marginBottom: 12, textTransform: 'uppercase' }}>Core Product</div>
                      {[
                        { emoji: '🛡️', title: 'Trust Evaluation', desc: 'Multi-layer risk scoring engine' },
                        { emoji: '📋', title: 'Policy Engine', desc: 'Upload & enforce policies at runtime' },
                        { emoji: '⚖️', title: 'Enforcement Engine', desc: 'Allow, Block, Rewrite, Escalate' },
                      ].map(item => (
                        <MegaMenuItem key={item.title} {...item} />
                      ))}
                    </div>
                    {/* Column 2 */}
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: 'rgba(240,242,255,0.35)', fontFamily: 'var(--font-body)', marginBottom: 12, textTransform: 'uppercase' }}>Capabilities</div>
                      {[
                        { emoji: '⚡', title: 'Agent Runtime Guard', desc: 'Intercept tool calls before execution' },
                        { emoji: '🔍', title: 'Prompt Architect', desc: 'Auto-generate compliance prompts' },
                        { emoji: '📊', title: 'Adaptive Evaluation', desc: 'Drift detection & version tracking' },
                      ].map(item => (
                        <MegaMenuItem key={item.title} {...item} />
                      ))}
                    </div>
                  </div>

                  {/* Footer row */}
                  <div style={{
                    marginTop: 20,
                    paddingTop: 16,
                    borderTop: '1px solid rgba(255,255,255,0.06)',
                    display: 'flex',
                    gap: 8,
                  }}>
                    {[
                      { icon: '▶', label: 'Watch 3-min demo', href: '#' },
                      { icon: '📚', label: 'Read the docs', href: '/docs' },
                      { icon: '⚡', label: 'Quick start', href: '/docs' },
                    ].map(link => (
                      <a key={link.label} href={link.href} style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        padding: '8px 12px',
                        borderRadius: 8,
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.06)',
                        fontSize: 12,
                        color: 'rgba(240,242,255,0.6)',
                        textDecoration: 'none',
                        transition: 'background 150ms, color 150ms',
                        fontFamily: 'var(--font-body)',
                      }}
                        onMouseEnter={e => {
                          (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(255,255,255,0.06)';
                          (e.currentTarget as HTMLAnchorElement).style.color = 'rgba(240,242,255,0.9)';
                        }}
                        onMouseLeave={e => {
                          (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(255,255,255,0.03)';
                          (e.currentTarget as HTMLAnchorElement).style.color = 'rgba(240,242,255,0.6)';
                        }}
                      >
                        <span>{link.icon}</span>
                        <span>{link.label}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Solutions */}
            <div
              style={{ position: 'relative' }}
              onMouseEnter={() => handleMenuEnter('solutions')}
              onMouseLeave={handleMenuLeave}
            >
              <button style={{
                ...navLinkStyle('/solutions') as React.CSSProperties,
                background: activeMenu === 'solutions' ? 'rgba(255,255,255,0.05)' : 'none',
                color: activeMenu === 'solutions' ? 'rgba(240,242,255,0.95)' : 'rgba(240,242,255,0.65)',
              }}>
                Solutions <span style={{ fontSize: 10, opacity: 0.7 }}>▾</span>
              </button>

              {/* Solutions Mega-Menu */}
              {activeMenu === 'solutions' && (
                <div style={{
                  position: 'absolute',
                  top: 'calc(100% + 8px)',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: 380,
                  background: 'rgba(8,13,26,0.97)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 20,
                  backdropFilter: 'blur(40px)',
                  boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
                  padding: 24,
                  animation: 'menuReveal 220ms ease-out both',
                  zIndex: 60,
                }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: 'rgba(240,242,255,0.35)', fontFamily: 'var(--font-body)', marginBottom: 12, textTransform: 'uppercase' }}>For AI Builders</div>
                    {[
                      { emoji: '🤖', title: 'AI SaaS Applications', desc: 'Production-grade AI safety layer' },
                      { emoji: '🔗', title: 'Agent Frameworks', desc: 'Intercept & govern autonomous agents' },
                      { emoji: '🏭', title: 'Enterprise AI Workflows', desc: 'Policy enforcement at enterprise scale' },
                    ].map(item => (
                      <MegaMenuItem key={item.title} {...item} />
                    ))}
                  </div>
                  <div style={{ marginTop: 20 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: 'rgba(240,242,255,0.35)', fontFamily: 'var(--font-body)', marginBottom: 12, textTransform: 'uppercase' }}>For Industries</div>
                    {[
                      { emoji: '🏥', title: 'Healthcare AI', desc: 'HIPAA-aware LLM governance' },
                      { emoji: '💰', title: 'Financial Services AI', desc: 'Compliance-grade AI controls' },
                      { emoji: '⚖️', title: 'Legal & Compliance AI', desc: 'Audit-ready AI decision trails' },
                    ].map(item => (
                      <MegaMenuItem key={item.title} {...item} />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Static links */}
            <a href="/#pricing" style={navLinkStyle('/#pricing') as React.CSSProperties}
              onMouseEnter={e => {
                (e.currentTarget as HTMLAnchorElement).style.color = 'rgba(240,242,255,0.95)';
                (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(255,255,255,0.05)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLAnchorElement).style.color = 'rgba(240,242,255,0.65)';
                (e.currentTarget as HTMLAnchorElement).style.background = 'none';
              }}
            >Pricing</a>
            <a href="/docs" style={navLinkStyle('/docs') as React.CSSProperties}
              onMouseEnter={e => {
                (e.currentTarget as HTMLAnchorElement).style.color = 'rgba(240,242,255,0.95)';
                (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(255,255,255,0.05)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLAnchorElement).style.color = 'rgba(240,242,255,0.65)';
                (e.currentTarget as HTMLAnchorElement).style.background = 'none';
              }}
            >Docs</a>
            <a href="/blog" style={navLinkStyle('/blog') as React.CSSProperties}
              onMouseEnter={e => {
                (e.currentTarget as HTMLAnchorElement).style.color = 'rgba(240,242,255,0.95)';
                (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(255,255,255,0.05)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLAnchorElement).style.color = 'rgba(240,242,255,0.65)';
                (e.currentTarget as HTMLAnchorElement).style.background = 'none';
              }}
            >Blog</a>
          </div>

          {/* Right CTAs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }} className="navbar-desktop-ctas">
            {/* Status indicator — xl only */}
            <div className="navbar-status-badge" style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 10px',
              borderRadius: 20,
              background: 'rgba(16,185,129,0.1)',
              border: '1px solid rgba(16,185,129,0.2)',
            }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', animation: 'pulse 2s infinite' }} />
              <span style={{ fontSize: 11, color: '#34d399', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap' }}>All systems operational</span>
            </div>

            {user ? (
              <>
                <Link href="/dashboard" style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 14,
                  color: 'rgba(240,242,255,0.8)',
                  textDecoration: 'none',
                  padding: '6px 14px',
                  borderRadius: 8,
                  transition: 'color 200ms',
                }}>Dashboard →</Link>

                {/* Avatar dropdown */}
                <div
                  style={{ position: 'relative' }}
                  onMouseEnter={handleAvatarEnter}
                  onMouseLeave={handleAvatarLeave}
                >
                  <button style={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontWeight: 700,
                    fontSize: 14,
                    fontFamily: 'var(--font-display)',
                  }}>
                    {user.email[0].toUpperCase()}
                  </button>

                  {avatarDropdown && (
                    <div style={{
                      position: 'absolute',
                      top: 'calc(100% + 8px)',
                      right: 0,
                      width: 220,
                      background: 'rgba(8,13,26,0.97)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 16,
                      backdropFilter: 'blur(40px)',
                      boxShadow: '0 16px 60px rgba(0,0,0,0.5)',
                      overflow: 'hidden',
                      animation: 'menuReveal 200ms ease-out both',
                      zIndex: 70,
                    }}>
                      <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        <div style={{ fontSize: 13, color: 'rgba(240,242,255,0.9)', fontFamily: 'var(--font-body)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.email}</div>
                        <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 6, background: 'rgba(124,58,237,0.2)', color: '#a78bfa', fontFamily: 'var(--font-body)', display: 'inline-block', marginTop: 4 }}>free</span>
                      </div>
                      {[
                        { icon: '⚡', label: 'Dashboard', href: '/dashboard' },
                        { icon: '📊', label: 'Analytics', href: '/dashboard/analytics' },
                        { icon: '💳', label: 'Billing', href: '/dashboard/billing' },
                        { icon: '⚙️', label: 'Settings', href: '/dashboard/settings' },
                      ].map(item => (
                        <Link key={item.label} href={item.href} style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '10px 16px',
                          color: 'rgba(240,242,255,0.7)',
                          textDecoration: 'none',
                          fontSize: 13,
                          fontFamily: 'var(--font-body)',
                          transition: 'background 150ms, color 150ms',
                        }}
                          onMouseEnter={e => {
                            (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(255,255,255,0.04)';
                            (e.currentTarget as HTMLAnchorElement).style.color = 'rgba(240,242,255,0.95)';
                          }}
                          onMouseLeave={e => {
                            (e.currentTarget as HTMLAnchorElement).style.background = 'transparent';
                            (e.currentTarget as HTMLAnchorElement).style.color = 'rgba(240,242,255,0.7)';
                          }}
                        >
                          <span>{item.icon}</span>
                          <span>{item.label}</span>
                        </Link>
                      ))}
                      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                        <button onClick={handleSignOut} style={{
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '10px 16px',
                          color: 'rgba(244,63,94,0.7)',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: 13,
                          fontFamily: 'var(--font-body)',
                          textAlign: 'left',
                          transition: 'background 150ms, color 150ms',
                        }}
                          onMouseEnter={e => {
                            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(244,63,94,0.06)';
                            (e.currentTarget as HTMLButtonElement).style.color = '#f43f5e';
                          }}
                          onMouseLeave={e => {
                            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                            (e.currentTarget as HTMLButtonElement).style.color = 'rgba(244,63,94,0.7)';
                          }}
                        >
                          <span>🚪</span>
                          <span>Sign out</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <Link href="/login" style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 14,
                  color: 'rgba(240,242,255,0.7)',
                  textDecoration: 'none',
                  padding: '7px 16px',
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.1)',
                  transition: 'color 200ms, border-color 200ms, background 200ms',
                }}
                  onMouseEnter={e => {
                    const el = e.currentTarget as HTMLAnchorElement;
                    el.style.color = 'rgba(240,242,255,0.95)';
                    el.style.borderColor = 'rgba(255,255,255,0.2)';
                    el.style.background = 'rgba(255,255,255,0.04)';
                  }}
                  onMouseLeave={e => {
                    const el = e.currentTarget as HTMLAnchorElement;
                    el.style.color = 'rgba(240,242,255,0.7)';
                    el.style.borderColor = 'rgba(255,255,255,0.1)';
                    el.style.background = 'transparent';
                  }}
                >Sign In</Link>

                <Link href="/signup" style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 14,
                  fontWeight: 500,
                  color: 'white',
                  textDecoration: 'none',
                  padding: '8px 18px',
                  borderRadius: 12,
                  background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
                  transition: 'transform 200ms, box-shadow 200ms',
                  display: 'inline-block',
                }}
                  onMouseEnter={e => {
                    const el = e.currentTarget as HTMLAnchorElement;
                    el.style.transform = 'scale(1.02)';
                    el.style.boxShadow = '0 4px 20px rgba(124,58,237,0.4)';
                  }}
                  onMouseLeave={e => {
                    const el = e.currentTarget as HTMLAnchorElement;
                    el.style.transform = 'scale(1)';
                    el.style.boxShadow = 'none';
                  }}
                >Start Free →</Link>
              </>
            )}

            {/* Hamburger (mobile) */}
            <button
              onClick={() => setMobileOpen(true)}
              className="navbar-hamburger"
              style={{
                display: 'none',
                flexDirection: 'column',
                gap: 5,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 6,
              }}
            >
              {[0, 1, 2].map(i => (
                <div key={i} style={{ width: 22, height: 2, background: 'rgba(240,242,255,0.8)', borderRadius: 2 }} />
              ))}
            </button>
          </div>
        </div>

        {/* Inline media query styles */}
        <style>{`
          @media (max-width: 767px) {
            .navbar-desktop-links { display: none !important; }
            .navbar-hamburger { display: flex !important; }
            .navbar-desktop-ctas .navbar-status-badge { display: none !important; }
            .navbar-desktop-ctas > a, .navbar-desktop-ctas > div:not(.navbar-hamburger) { display: none !important; }
          }
          @media (min-width: 768px) {
            .navbar-desktop-links { display: flex !important; }
            .navbar-hamburger { display: none !important; }
          }
          @media (max-width: 767px) {
            .navbar-status-badge { display: none !important; }
          }
        `}</style>
      </nav>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 60,
          background: 'rgba(5,8,16,0.98)',
          backdropFilter: 'blur(40px)',
          transform: 'translateX(0)',
          animation: 'drawerSlideIn 300ms cubic-bezier(0.16,1,0.3,1) both',
          overflowY: 'auto',
        }}>
          {/* Drawer header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '20px 24px',
            borderBottom: '1px solid rgba(255,255,255,0.07)',
          }}>
            <Link href="/" onClick={() => setMobileOpen(false)} style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
              <VeldrixLogoMark size={28} />
              <span style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 800,
                fontSize: '16px',
                background: 'linear-gradient(135deg, #fff 0%, #a78bfa 60%, #67e8f9 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}>VeldrixAI</span>
            </Link>
            <button onClick={() => setMobileOpen(false)} style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 24,
              color: 'rgba(240,242,255,0.6)',
              lineHeight: 1,
              padding: 4,
            }}>✕</button>
          </div>

          {/* Drawer nav items */}
          <div style={{ padding: '16px 24px' }}>
            {/* Product accordion */}
            <MobileAccordionItem
              label="Product"
              isOpen={mobileProductOpen}
              onToggle={() => setMobileProductOpen(v => !v)}
            >
              {[
                { emoji: '🛡️', title: 'Trust Evaluation', href: '#' },
                { emoji: '📋', title: 'Policy Engine', href: '#' },
                { emoji: '⚖️', title: 'Enforcement Engine', href: '#' },
                { emoji: '⚡', title: 'Agent Runtime Guard', href: '#' },
                { emoji: '🔍', title: 'Prompt Architect', href: '#' },
                { emoji: '📊', title: 'Adaptive Evaluation', href: '#' },
              ].map(item => (
                <a key={item.title} href={item.href} onClick={() => setMobileOpen(false)} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 12px',
                  borderRadius: 8,
                  color: 'rgba(240,242,255,0.65)',
                  textDecoration: 'none',
                  fontSize: 14,
                  fontFamily: 'var(--font-body)',
                }}>
                  <span>{item.emoji}</span>
                  <span>{item.title}</span>
                </a>
              ))}
            </MobileAccordionItem>

            {/* Solutions accordion */}
            <MobileAccordionItem
              label="Solutions"
              isOpen={mobileSolutionsOpen}
              onToggle={() => setMobileSolutionsOpen(v => !v)}
            >
              {[
                { emoji: '🤖', title: 'AI SaaS Applications', href: '#' },
                { emoji: '🔗', title: 'Agent Frameworks', href: '#' },
                { emoji: '🏭', title: 'Enterprise AI Workflows', href: '#' },
                { emoji: '🏥', title: 'Healthcare AI', href: '#' },
                { emoji: '💰', title: 'Financial Services AI', href: '#' },
                { emoji: '⚖️', title: 'Legal & Compliance AI', href: '#' },
              ].map(item => (
                <a key={item.title} href={item.href} onClick={() => setMobileOpen(false)} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 12px',
                  borderRadius: 8,
                  color: 'rgba(240,242,255,0.65)',
                  textDecoration: 'none',
                  fontSize: 14,
                  fontFamily: 'var(--font-body)',
                }}>
                  <span>{item.emoji}</span>
                  <span>{item.title}</span>
                </a>
              ))}
            </MobileAccordionItem>

            {/* Static links */}
            {[
              { label: 'Pricing', href: '/#pricing' },
              { label: 'Docs', href: '/docs' },
              { label: 'Blog', href: '/blog' },
            ].map(link => (
              <a key={link.label} href={link.href} onClick={() => setMobileOpen(false)} style={{
                display: 'block',
                padding: '14px 4px',
                borderBottom: '1px solid rgba(255,255,255,0.05)',
                color: 'rgba(240,242,255,0.7)',
                textDecoration: 'none',
                fontSize: 15,
                fontFamily: 'var(--font-body)',
              }}>{link.label}</a>
            ))}

            {/* CTA buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 24 }}>
              {user ? (
                <>
                  <Link href="/dashboard" onClick={() => setMobileOpen(false)} style={{
                    display: 'block',
                    width: '100%',
                    padding: '14px',
                    textAlign: 'center',
                    borderRadius: 12,
                    background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
                    color: 'white',
                    textDecoration: 'none',
                    fontFamily: 'var(--font-body)',
                    fontWeight: 500,
                    fontSize: 15,
                    boxSizing: 'border-box',
                  }}>Dashboard →</Link>
                  <button onClick={handleSignOut} style={{
                    width: '100%',
                    padding: '14px',
                    borderRadius: 12,
                    background: 'rgba(244,63,94,0.1)',
                    border: '1px solid rgba(244,63,94,0.2)',
                    color: '#f43f5e',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-body)',
                    fontWeight: 500,
                    fontSize: 15,
                  }}>🚪 Sign Out</button>
                </>
              ) : (
                <>
                  <Link href="/login" onClick={() => setMobileOpen(false)} style={{
                    display: 'block',
                    width: '100%',
                    padding: '14px',
                    textAlign: 'center',
                    borderRadius: 12,
                    border: '1px solid rgba(255,255,255,0.12)',
                    color: 'rgba(240,242,255,0.8)',
                    textDecoration: 'none',
                    fontFamily: 'var(--font-body)',
                    fontWeight: 500,
                    fontSize: 15,
                    boxSizing: 'border-box',
                  }}>Sign In</Link>
                  <Link href="/signup" onClick={() => setMobileOpen(false)} style={{
                    display: 'block',
                    width: '100%',
                    padding: '14px',
                    textAlign: 'center',
                    borderRadius: 12,
                    background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
                    color: 'white',
                    textDecoration: 'none',
                    fontFamily: 'var(--font-body)',
                    fontWeight: 500,
                    fontSize: 15,
                    boxSizing: 'border-box',
                  }}>Start Free →</Link>
                </>
              )}
            </div>

            {/* Footer trust badges */}
            <div style={{
              display: 'flex',
              gap: 16,
              justifyContent: 'center',
              marginTop: 32,
              paddingTop: 24,
              borderTop: '1px solid rgba(255,255,255,0.06)',
            }}>
              <span style={{ fontSize: 12, color: 'rgba(240,242,255,0.35)', fontFamily: 'var(--font-body)' }}>🔒 SOC 2 Ready</span>
              <span style={{ fontSize: 12, color: 'rgba(240,242,255,0.35)', fontFamily: 'var(--font-body)' }}>✓ GDPR Compliant</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MegaMenuItem({ emoji, title, desc }: { emoji: string; title: string; desc: string }) {
  const [hovered, setHovered] = useState(false);
  return (
    <a href="#" style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12,
      padding: '10px 12px',
      borderRadius: 10,
      borderLeft: hovered ? '2px solid #7c3aed' : '2px solid transparent',
      background: hovered ? 'rgba(255,255,255,0.04)' : 'transparent',
      textDecoration: 'none',
      transition: 'background 150ms, border-color 150ms',
      cursor: 'pointer',
    }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span style={{ fontSize: 18, lineHeight: 1, marginTop: 1 }}>{emoji}</span>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'rgba(240,242,255,0.9)', fontFamily: 'var(--font-body)', lineHeight: 1.3 }}>{title}</div>
        <div style={{ fontSize: 12, color: 'rgba(240,242,255,0.45)', fontFamily: 'var(--font-body)', marginTop: 2 }}>{desc}</div>
      </div>
    </a>
  );
}

function MobileAccordionItem({
  label,
  isOpen,
  onToggle,
  children,
}: {
  label: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <button onClick={onToggle} style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '14px 4px',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        color: 'rgba(240,242,255,0.7)',
        fontFamily: 'var(--font-body)',
        fontSize: 15,
        textAlign: 'left',
      }}>
        <span>{label}</span>
        <span style={{ fontSize: 12, transition: 'transform 200ms', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▾</span>
      </button>
      {isOpen && (
        <div style={{ paddingBottom: 8, paddingLeft: 8 }}>
          {children}
        </div>
      )}
    </div>
  );
}
