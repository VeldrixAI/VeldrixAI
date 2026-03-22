"use client";

import { useState, useEffect, FormEvent, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";

// ── Canonical V Brand Mark ────────────────────────────────────────────────────
function VBrandMark({ suffix, size = 26 }: { suffix: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={`vg1-${suffix}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#c4b5fd" />
          <stop offset="50%" stopColor="#818cf8" />
          <stop offset="100%" stopColor="#67e8f9" />
        </linearGradient>
        <linearGradient id={`vg2-${suffix}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#a78bfa" />
        </linearGradient>
        <linearGradient id={`sq-${suffix}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.2" />
        </linearGradient>
        <filter id={`fg-${suffix}`}>
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id={`fg2-${suffix}`}>
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <rect x="8" y="8" width="84" height="84" rx="18" fill={`url(#sq-${suffix})`} stroke={`url(#vg1-${suffix})`} strokeWidth="1" />
      <path d="M50 18 L82 50 L50 82 L18 50 Z" fill="none" stroke={`url(#vg1-${suffix})`} strokeWidth="0.8" strokeOpacity="0.3" />
      <path d="M24 30 L50 70 L76 30" fill="none" stroke={`url(#vg2-${suffix})`} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" filter={`url(#fg-${suffix})`} />
      <circle cx="50" cy="70" r="5" fill={`url(#vg1-${suffix})`} filter={`url(#fg2-${suffix})`} />
      <circle cx="50" cy="70" r="2.5" fill="white" opacity="0.9" />
      <rect x="30" y="47" width="14" height="2.5" rx="1.25" fill="#a78bfa" opacity="0.6" />
      <rect x="56" y="47" width="14" height="2.5" rx="1.25" fill="#67e8f9" opacity="0.6" />
      <line x1="50" y1="8" x2="50" y2="16" stroke="#c4b5fd" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
    </svg>
  );
}

// ── Google icon ───────────────────────────────────────────────────────────────
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

// ── GitHub icon ───────────────────────────────────────────────────────────────
function GitHubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.385-1.335-1.755-1.335-1.755-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 21.795 24 17.295 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

// ── Inline icon helpers ───────────────────────────────────────────────────────
function EmailIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  );
}
function LockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

// ── Main login form ──────────────────────────────────────────────────────────
function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const redirectPath = searchParams.get('redirect') || '/dashboard';
  const planParam = searchParams.get('plan');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [googleHovered, setGoogleHovered] = useState(false);
  const [githubHovered, setGithubHovered] = useState(false);

  // Uptime counter animation
  useEffect(() => {
    const el = document.getElementById('uptime-stat');
    if (!el) return;
    let val = 0;
    const target = 99.9;
    const step = (target / 1500) * 16;
    const interval = setInterval(() => {
      val = Math.min(val + step, target);
      el.textContent = val.toFixed(1) + '%';
      if (val >= target) clearInterval(interval);
    }, 16);
    return () => clearInterval(interval);
  }, []);

  const handleOAuth = async (provider: 'google' | 'github') => {
    try {
      const res = await fetch('/api/auth/oauth-urls');
      const data = await res.json();
      window.location.href = data[provider];
    } catch {
      setError('Failed to initiate OAuth. Please try again.');
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || data.error || 'Invalid email or password.');
      }
      if (planParam) {
        router.push(`/dashboard/billing?plan=${planParam}`);
      } else {
        router.push(redirectPath);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ background: '#050810', color: '#f0f2ff', fontFamily: 'var(--font-body)', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>

      {/* ── Fixed Header ── */}
      <header style={{ background: 'rgba(5,8,16,0.85)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', position: 'fixed', width: '100%', top: 0, zIndex: 100, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 32px' }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '12px', textDecoration: 'none' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, rgba(124,58,237,0.3), rgba(6,182,212,0.2))', border: '1px solid rgba(124,58,237,0.3)', boxShadow: '0 4px 16px rgba(124,58,237,0.3)', flexShrink: 0 }}>
              <VBrandMark suffix="signin-header" size={26} />
            </div>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '22px', letterSpacing: '-0.5px', color: 'white' }}>
              Veldrix<span className="shimmer-text">AI</span>
            </span>
          </Link>
          <nav style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
            <Link href="/" style={{ color: 'rgba(240,242,255,0.5)', fontSize: '14px', fontWeight: 500, textDecoration: 'none', transition: 'color 0.2s' }}>Back to Site</Link>
            <Link href="/support" style={{ color: 'rgba(240,242,255,0.5)', fontSize: '14px', fontWeight: 500, textDecoration: 'none', transition: 'color 0.2s' }}>Support</Link>
          </nav>
        </div>
      </header>

      {/* ── Main two-column split ── */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', paddingTop: '80px' }}>
        <div style={{ display: 'flex', flex: 1, minHeight: 'calc(100vh - 80px - 88px)' }}>

          {/* ─── LEFT PANEL: Sovereign Statement ─── */}
          <section
            className="auth-split-left"
            style={{ width: '50%', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 56px', overflow: 'hidden', background: 'linear-gradient(145deg, #0d0f1a 0%, #050810 100%)' }}
          >
            <div className="dot-mesh" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
            <div className="noise-overlay" />
            <div className="scan-line" />
            <div className="orb" style={{ width: '500px', height: '500px', top: '-150px', left: '-100px', background: 'radial-gradient(circle, rgba(124,58,237,0.15) 0%, transparent 70%)' }} />
            <div className="orb" style={{ width: '300px', height: '300px', bottom: '-80px', right: '-50px', background: 'radial-gradient(circle, rgba(6,182,212,0.1) 0%, transparent 70%)' }} />

            <div style={{ position: 'relative', zIndex: 10, maxWidth: '480px' }} className="reveal-up">

              {/* Governance badge */}
              <div style={{ marginBottom: '32px' }}>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#10b981', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', padding: '6px 14px', borderRadius: '100px', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                  <span className="live-dot" style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
                  Governance Layer · Active
                </span>
              </div>

              {/* Headline */}
              <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 'clamp(36px,3.8vw,56px)', letterSpacing: '-1.5px', lineHeight: 1.1, marginBottom: '24px', color: '#f0f2ff' }}>
                Secure <br />
                <span style={{ background: 'linear-gradient(135deg,#ffffff 0%,#a78bfa 45%,#67e8f9 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Institutional</span><br />
                Intelligence.
              </h1>

              {/* Body */}
              <p style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '18px', lineHeight: 1.7, color: 'rgba(240,242,255,0.5)', maxWidth: '400px', marginBottom: '56px' }}>
                Access the world&apos;s most advanced auditing and governance framework for autonomous AI systems.
              </p>

              {/* Stats row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
                <div className="metric-card mc-1">
                  <div id="uptime-stat" style={{ fontFamily: 'var(--font-mono)', fontSize: '28px', fontWeight: 700, color: '#10b981', marginBottom: '4px' }}>0.0%</div>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: '10px', fontWeight: 500, letterSpacing: '3px', textTransform: 'uppercase', color: 'rgba(240,242,255,0.3)' }}>Uptime Protocol</div>
                </div>
                <div className="metric-card mc-2">
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '28px', fontWeight: 700, color: '#7c3aed', marginBottom: '4px' }}>AES-256</div>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: '10px', fontWeight: 500, letterSpacing: '3px', textTransform: 'uppercase', color: 'rgba(240,242,255,0.3)' }}>Vault Encryption</div>
                </div>
              </div>
            </div>
          </section>

          {/* ─── RIGHT PANEL: Login Form ─── */}
          <section
            className="auth-split-right"
            style={{ width: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px', background: '#070910' }}
          >
            <div className="glass-panel reveal-up" style={{ width: '100%', maxWidth: '480px', padding: '48px', borderRadius: '24px', boxShadow: '0 20px 60px rgba(0,0,0,0.5)', animationDelay: '0.15s' }}>

              {/* Portal header */}
              <div style={{ textAlign: 'center', marginBottom: '40px' }}>
                <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '28px', color: '#f0f2ff', marginBottom: '8px' }}>Access Portal</h2>
                <p style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '15px', color: 'rgba(240,242,255,0.5)' }}>Verify identity to initialize governance session.</p>
              </div>

              {/* SSO buttons */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '32px' }}>
                <button
                  type="button"
                  onClick={() => handleOAuth('google')}
                  onMouseEnter={() => setGoogleHovered(true)}
                  onMouseLeave={() => setGoogleHovered(false)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '14px', borderRadius: '14px', background: googleHovered ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#f0f2ff', fontFamily: 'var(--font-body)', fontSize: '14px', fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s' }}
                >
                  <GoogleIcon />
                  Google
                </button>
                <button
                  type="button"
                  onClick={() => handleOAuth('github')}
                  onMouseEnter={() => setGithubHovered(true)}
                  onMouseLeave={() => setGithubHovered(false)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '14px', borderRadius: '14px', background: githubHovered ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#f0f2ff', fontFamily: 'var(--font-body)', fontSize: '14px', fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s' }}
                >
                  <GitHubIcon />
                  GitHub
                </button>
              </div>

              {/* Divider */}
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '32px', gap: '16px' }}>
                <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.07)' }} />
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '10px', fontWeight: 500, letterSpacing: '3px', textTransform: 'uppercase', color: 'rgba(240,242,255,0.3)' }}>System Auth</span>
                <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.07)' }} />
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

                {/* Work Email */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontFamily: 'var(--font-body)', fontSize: '10px', fontWeight: 500, letterSpacing: '3px', textTransform: 'uppercase', color: 'rgba(240,242,255,0.35)' }}>Work Email</label>
                  <div style={{ position: 'relative' }}>
                    <div style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(240,242,255,0.3)', pointerEvents: 'none' }}>
                      <EmailIcon />
                    </div>
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      onFocus={() => setEmailFocused(true)}
                      onBlur={() => setEmailFocused(false)}
                      placeholder="name@corporation.ai"
                      required
                      className="field-glow"
                      style={{ width: '100%', background: '#070910', border: `1px solid ${emailFocused ? 'rgba(124,58,237,0.5)' : 'rgba(255,255,255,0.07)'}`, color: '#f0f2ff', borderRadius: '14px', padding: '14px 14px 14px 44px', fontFamily: 'var(--font-body)', fontSize: '15px', outline: 'none', transition: 'all 0.2s', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>

                {/* Access Key */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ fontFamily: 'var(--font-body)', fontSize: '10px', fontWeight: 500, letterSpacing: '3px', textTransform: 'uppercase', color: 'rgba(240,242,255,0.35)' }}>Access Key</label>
                    <Link href="/forgot-password" style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: '#7c3aed', textDecoration: 'none' }}>Revoke Access?</Link>
                  </div>
                  <div style={{ position: 'relative' }}>
                    <div style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(240,242,255,0.3)', pointerEvents: 'none' }}>
                      <LockIcon />
                    </div>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      onFocus={() => setPasswordFocused(true)}
                      onBlur={() => setPasswordFocused(false)}
                      placeholder="••••••••••••"
                      required
                      className="field-glow"
                      style={{ width: '100%', background: '#070910', border: `1px solid ${passwordFocused ? 'rgba(124,58,237,0.5)' : 'rgba(255,255,255,0.07)'}`, color: '#f0f2ff', borderRadius: '14px', padding: '14px 44px', fontFamily: 'var(--font-body)', fontSize: '15px', outline: 'none', transition: 'all 0.2s', boxSizing: 'border-box' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      style={{ position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(240,242,255,0.3)', padding: 0, display: 'flex', alignItems: 'center', transition: 'color 0.2s' }}
                    >
                      <EyeIcon open={showPassword} />
                    </button>
                  </div>
                </div>

                {/* Remember session */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input
                    type="checkbox"
                    id="remember-session"
                    style={{ width: '16px', height: '16px', accentColor: '#7c3aed', cursor: 'pointer', flexShrink: 0 }}
                  />
                  <label htmlFor="remember-session" style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'rgba(240,242,255,0.5)', cursor: 'pointer' }}>
                    Secure Session Persistence
                  </label>
                </div>

                {/* Error */}
                {error && (
                  <div style={{ background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.2)', borderRadius: '10px', padding: '10px 14px', fontSize: '13px', color: '#f87171', fontFamily: 'var(--font-body)' }}>
                    {error}
                  </div>
                )}

                {/* Submit */}
                <button
                  type="submit"
                  disabled={loading}
                  className="primary-gradient btn-glow"
                  style={{ width: '100%', padding: '16px', borderRadius: '14px', border: 'none', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '16px', color: 'white', cursor: loading ? 'not-allowed' : 'pointer', transition: 'all 0.3s', marginTop: '8px', letterSpacing: '0.5px', opacity: loading ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                  onMouseEnter={e => { if (!loading) { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)'; } }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)'; }}
                >
                  {loading ? (
                    <>
                      <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', animation: 'spin 0.7s linear infinite' }} />
                      Signing in...
                    </>
                  ) : 'Initialize Session'}
                </button>
              </form>

              {/* Sign up link */}
              <div style={{ marginTop: '32px', textAlign: 'center' }}>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'rgba(240,242,255,0.35)' }}>
                  New entity?{' '}
                  <Link href="/signup" style={{ color: '#7c3aed', fontWeight: 600, textDecoration: 'none' }}>Apply for Provisioning</Link>
                </p>
              </div>
            </div>
          </section>

        </div>
      </main>

      {/* ── Footer ── */}
      <footer style={{ background: 'rgba(5,8,16,0.9)', borderTop: '1px solid rgba(255,255,255,0.05)', padding: '24px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, rgba(124,58,237,0.3), rgba(6,182,212,0.2))', border: '1px solid rgba(124,58,237,0.3)', boxShadow: '0 2px 10px rgba(124,58,237,0.2)', flexShrink: 0 }}>
            <VBrandMark suffix="signin-footer" size={20} />
          </div>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '18px', letterSpacing: '-0.5px', color: 'white' }}>
            Veldrix<span className="shimmer-text">AI</span>
          </span>
        </div>
        <span style={{ fontFamily: 'var(--font-body)', fontSize: '11px', letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(240,242,255,0.2)' }}>
          © 2026 VeldrixAI Technologies Inc. All Rights Reserved.
        </span>
        <div style={{ display: 'flex', gap: '24px' }}>
          <Link href="/privacy" style={{ fontFamily: 'var(--font-body)', fontSize: '11px', letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(240,242,255,0.25)', textDecoration: 'none', transition: 'color 0.2s' }}>Privacy Policy</Link>
          <Link href="/terms" style={{ fontFamily: 'var(--font-body)', fontSize: '11px', letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(240,242,255,0.25)', textDecoration: 'none', transition: 'color 0.2s' }}>Terms of Service</Link>
          <Link href="/security" style={{ fontFamily: 'var(--font-body)', fontSize: '11px', letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(240,242,255,0.25)', textDecoration: 'none', transition: 'color 0.2s' }}>Security Architecture</Link>
        </div>
      </footer>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
