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

// ── Eye icon ──────────────────────────────────────────────────────────────────
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

// ── Signup form ───────────────────────────────────────────────────────────────
function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const redirectPath = searchParams.get('redirect') || '/dashboard';
  const planParam = searchParams.get('plan');

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [termsChecked, setTermsChecked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Focus states
  const [firstFocused, setFirstFocused] = useState(false);
  const [lastFocused, setLastFocused] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);

  // Hover states
  const [googleHovered, setGoogleHovered] = useState(false);
  const [githubHovered, setGithubHovered] = useState(false);

  // Password strength
  const passwordStrength = (() => {
    if (!password) return 0;
    let score = 0;
    if (password.length >= 8) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    return score;
  })();
  const strengthLabel = ['', 'Weak', 'Fair', 'Good', 'Strong'][passwordStrength];
  const strengthColor = ['', '#f43f5e', '#f59e0b', '#10b981', '#06b6d4'][passwordStrength];

  // Compliance stat counter
  useEffect(() => {
    const el = document.getElementById('compliance-stat');
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
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (!termsChecked) {
      setError('Please acknowledge the Sovereign Governance Agreement.');
      return;
    }
    setLoading(true);
    try {
      const full_name = `${firstName} ${lastName}`.trim();
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name, email, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || data.error || data.detail || 'Registration failed. Please try again.');
      }
      setSuccess(true);
      setTimeout(() => {
        if (planParam) {
          router.push(`/dashboard/billing?plan=${planParam}`);
        } else {
          router.push(redirectPath);
        }
      }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ background: '#050810', color: '#f0f2ff', fontFamily: 'var(--font-body)', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>

      {/* ── Fixed Header ── */}
      <header style={{ position: 'fixed', top: 0, left: 0, width: '100%', zIndex: 100, padding: '20px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(5,8,16,0.85)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '12px', textDecoration: 'none' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, rgba(124,58,237,0.3), rgba(6,182,212,0.2))', border: '1px solid rgba(124,58,237,0.3)', boxShadow: '0 4px 16px rgba(124,58,237,0.3)', flexShrink: 0 }}>
            <VBrandMark suffix="signup-header" size={26} />
          </div>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '22px', letterSpacing: '-0.5px', color: 'white' }}>
            Veldrix<span className="shimmer-text">AI</span>
          </span>
        </Link>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span className="live-dot" style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
          <span style={{ fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 500, letterSpacing: '3px', textTransform: 'uppercase', color: 'rgba(240,242,255,0.35)' }}>Governance &amp; Trust Secured</span>
        </div>
      </header>

      {/* ── Main two-column split ── */}
      <main style={{ flex: 1, display: 'flex', minHeight: '100vh', paddingTop: '80px' }}>

        {/* ─── LEFT PANEL: Trust Metrics ─── */}
        <section
          className="auth-split-left"
          style={{ width: '50%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '80px 96px', background: '#0a0c15', position: 'relative', overflow: 'hidden' }}
        >
          <div className="dot-mesh" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
          <div className="scan-line" />
          <div className="orb" style={{ width: '400px', height: '400px', top: '-100px', left: '-100px', background: 'radial-gradient(circle, rgba(124,58,237,0.12) 0%, transparent 70%)' }} />
          <div className="orb" style={{ width: '200px', height: '200px', bottom: '50px', right: '-30px', background: 'radial-gradient(circle, rgba(6,182,212,0.08) 0%, transparent 70%)' }} />

          <div style={{ position: 'relative', zIndex: 10, maxWidth: '480px' }}>

            {/* Sovereign badge */}
            <div style={{ marginBottom: '24px' }}>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#10b981', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', padding: '6px 14px', borderRadius: '100px', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <span className="live-dot" style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
                Sovereign Layer Active
              </span>
            </div>

            {/* Headline */}
            <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 'clamp(40px,4.5vw,68px)', letterSpacing: '-2px', lineHeight: 1.05, marginBottom: '20px', maxWidth: '420px', color: '#f0f2ff' }}>
              The Future of
              <span style={{ background: 'linear-gradient(135deg, #a78bfa 0%, #7c3aed 50%, #67e8f9 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}> Audited</span>
              {' '}Intelligence.
            </h1>

            {/* Subheading */}
            <p style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '16px', lineHeight: 1.7, color: 'rgba(240,242,255,0.5)', maxWidth: '360px', marginBottom: '48px' }}>
              VeldrixAI orchestrates enterprise governance with impenetrable security frameworks and real-time audit intelligence.
            </p>

            {/* Trust Metrics Bento Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>

              {/* Compliance card */}
              <div
                className="glass-panel metric-card mc-1"
                style={{ padding: '24px', borderRadius: '20px', transition: 'all 0.3s', cursor: 'default' }}
                onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(124,58,237,0.3)'}
                onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,0.07)'}
              >
                <div style={{ marginBottom: '16px' }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="1.5">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    <path d="m9 12 2 2 4-4" />
                  </svg>
                </div>
                <div id="compliance-stat" style={{ fontFamily: 'var(--font-mono)', fontSize: '24px', fontWeight: 700, color: '#f0f2ff', marginBottom: '4px' }}>0.0%</div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: '10px', fontWeight: 500, letterSpacing: '3px', textTransform: 'uppercase', color: 'rgba(240,242,255,0.3)' }}>Audit Compliance</div>
              </div>

              {/* Encryption card */}
              <div
                className="glass-panel metric-card mc-2"
                style={{ padding: '24px', borderRadius: '20px', transition: 'all 0.3s', cursor: 'default' }}
                onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(124,58,237,0.3)'}
                onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,0.07)'}
              >
                <div style={{ marginBottom: '16px' }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="1.5">
                    <rect x="3" y="11" width="18" height="11" rx="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '24px', fontWeight: 700, color: '#f0f2ff', marginBottom: '4px' }}>256-bit</div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: '10px', fontWeight: 500, letterSpacing: '3px', textTransform: 'uppercase', color: 'rgba(240,242,255,0.3)' }}>AES Encryption</div>
              </div>

              {/* Trust gauge full-width card */}
              <div
                className="glass-panel metric-card mc-3"
                style={{ gridColumn: '1 / span 2', padding: '24px', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '24px', transition: 'all 0.3s', cursor: 'default' }}
                onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(16,185,129,0.3)'}
                onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,0.07)'}
              >
                {/* Conic gauge ring */}
                <div style={{ flexShrink: 0, position: 'relative', width: '72px', height: '72px' }}>
                  <div
                    className="trust-gauge-anim"
                    style={{ width: '72px', height: '72px', borderRadius: '50%', padding: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: '#050810', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', fontWeight: 700, color: '#10b981', letterSpacing: '1px' }}>75%</span>
                    </div>
                  </div>
                </div>
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '16px', color: '#f0f2ff', marginBottom: '4px' }}>Real-time Governance</div>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: '13px', fontWeight: 300, color: 'rgba(240,242,255,0.5)', lineHeight: 1.5 }}>Infrastructure health monitored by Veldrix Core</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ─── RIGHT PANEL: Registration Form ─── */}
        <section
          className="auth-split-right"
          style={{ width: '50%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '48px 64px', background: '#050810' }}
        >
          <div style={{ width: '100%', maxWidth: '460px' }} className="reveal-up">

            {/* Success state */}
            {success && (
              <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: '14px', padding: '16px 20px', fontSize: '14px', color: '#34d399', fontFamily: 'var(--font-body)', textAlign: 'center', marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                <span style={{ fontSize: '18px' }}>✓</span>
                Account initialized! Redirecting…
              </div>
            )}

            {/* Form header */}
            <div style={{ marginBottom: '40px' }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '28px', color: '#f0f2ff', marginBottom: '8px', letterSpacing: '-0.5px' }}>Initialize Account</h2>
              <p style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '15px', color: 'rgba(240,242,255,0.5)' }}>Secure your sovereign data environment.</p>
            </div>

            {/* SSO options */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '28px' }}>
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
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '28px', gap: '16px' }}>
              <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.07)' }} />
              <span style={{ fontFamily: 'var(--font-body)', fontSize: '10px', fontWeight: 500, letterSpacing: '3px', textTransform: 'uppercase', color: 'rgba(240,242,255,0.3)' }}>Or Secure Email</span>
              <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.07)' }} />
            </div>

            {/* Registration form */}
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>

              {/* Institutional Email */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontFamily: 'var(--font-body)', fontSize: '10px', fontWeight: 500, letterSpacing: '3px', textTransform: 'uppercase', color: 'rgba(240,242,255,0.35)' }}>Institutional Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  onFocus={() => setEmailFocused(true)}
                  onBlur={() => setEmailFocused(false)}
                  placeholder="name@organization.ai"
                  required
                  autoComplete="email"
                  className="field-glow"
                  style={{ width: '100%', background: '#0a0c15', border: `1px solid ${emailFocused ? 'rgba(124,58,237,0.5)' : 'rgba(255,255,255,0.07)'}`, color: '#f0f2ff', borderRadius: '14px', padding: '14px 16px', fontFamily: 'var(--font-body)', fontSize: '15px', outline: 'none', transition: 'all 0.2s', boxSizing: 'border-box' }}
                />
              </div>

              {/* First + Last name row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontFamily: 'var(--font-body)', fontSize: '10px', fontWeight: 500, letterSpacing: '3px', textTransform: 'uppercase', color: 'rgba(240,242,255,0.35)' }}>First Name</label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={e => setFirstName(e.target.value)}
                    onFocus={() => setFirstFocused(true)}
                    onBlur={() => setFirstFocused(false)}
                    placeholder="John"
                    required
                    autoComplete="given-name"
                    className="field-glow"
                    style={{ width: '100%', background: '#0a0c15', border: `1px solid ${firstFocused ? 'rgba(124,58,237,0.5)' : 'rgba(255,255,255,0.07)'}`, color: '#f0f2ff', borderRadius: '14px', padding: '14px 16px', fontFamily: 'var(--font-body)', fontSize: '15px', outline: 'none', transition: 'all 0.2s', boxSizing: 'border-box' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontFamily: 'var(--font-body)', fontSize: '10px', fontWeight: 500, letterSpacing: '3px', textTransform: 'uppercase', color: 'rgba(240,242,255,0.35)' }}>Last Name</label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={e => setLastName(e.target.value)}
                    onFocus={() => setLastFocused(true)}
                    onBlur={() => setLastFocused(false)}
                    placeholder="Doe"
                    required
                    autoComplete="family-name"
                    className="field-glow"
                    style={{ width: '100%', background: '#0a0c15', border: `1px solid ${lastFocused ? 'rgba(124,58,237,0.5)' : 'rgba(255,255,255,0.07)'}`, color: '#f0f2ff', borderRadius: '14px', padding: '14px 16px', fontFamily: 'var(--font-body)', fontSize: '15px', outline: 'none', transition: 'all 0.2s', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              {/* Access Credentials */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontFamily: 'var(--font-body)', fontSize: '10px', fontWeight: 500, letterSpacing: '3px', textTransform: 'uppercase', color: 'rgba(240,242,255,0.35)' }}>Access Credentials</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    onFocus={() => setPasswordFocused(true)}
                    onBlur={() => setPasswordFocused(false)}
                    placeholder="••••••••••••"
                    required
                    autoComplete="new-password"
                    className="field-glow"
                    style={{ width: '100%', background: '#0a0c15', border: `1px solid ${passwordFocused ? 'rgba(124,58,237,0.5)' : 'rgba(255,255,255,0.07)'}`, color: '#f0f2ff', borderRadius: '14px', padding: '14px 44px 14px 16px', fontFamily: 'var(--font-body)', fontSize: '15px', outline: 'none', transition: 'all 0.2s', boxSizing: 'border-box' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    style={{ position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(240,242,255,0.3)', padding: 0, display: 'flex', alignItems: 'center', transition: 'color 0.2s' }}
                  >
                    <EyeIcon open={showPassword} />
                  </button>
                </div>
                {/* Password strength bar */}
                {password.length > 0 && (
                  <div style={{ marginTop: '4px' }}>
                    <div style={{ display: 'flex', gap: '4px', marginBottom: '4px' }}>
                      {[1, 2, 3, 4].map(i => (
                        <div key={i} style={{ flex: 1, height: '3px', borderRadius: '2px', background: i <= passwordStrength ? strengthColor : 'rgba(255,255,255,0.08)', transition: 'background 300ms' }} />
                      ))}
                    </div>
                    <span style={{ fontSize: '11px', color: strengthColor, fontFamily: 'var(--font-body)' }}>{strengthLabel}</span>
                  </div>
                )}
              </div>

              {/* Terms checkbox */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '4px 0' }}>
                <input
                  type="checkbox"
                  id="terms-check"
                  checked={termsChecked}
                  onChange={e => setTermsChecked(e.target.checked)}
                  style={{ width: '16px', height: '16px', accentColor: '#7c3aed', cursor: 'pointer', flexShrink: 0, marginTop: '2px' }}
                />
                <label htmlFor="terms-check" style={{ fontFamily: 'var(--font-body)', fontSize: '13px', fontWeight: 300, color: 'rgba(240,242,255,0.5)', lineHeight: 1.6, cursor: 'pointer' }}>
                  I acknowledge the{' '}
                  <Link href="/terms" style={{ color: '#7c3aed', textDecoration: 'none', fontWeight: 500 }}>Sovereign Governance Agreement</Link>
                  {' '}and consent to real-time auditing of system interactions.
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
                disabled={loading || success}
                className="primary-gradient btn-glow"
                style={{ width: '100%', padding: '16px', borderRadius: '14px', border: 'none', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '16px', color: 'white', cursor: (loading || success) ? 'not-allowed' : 'pointer', transition: 'all 0.3s', marginTop: '4px', letterSpacing: '0.5px', opacity: (loading || success) ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}
                onMouseEnter={e => { if (!loading && !success) (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)'; }}
              >
                {loading ? (
                  <>
                    <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', animation: 'spin 0.7s linear infinite' }} />
                    Initializing...
                  </>
                ) : (
                  <>
                    Initialize Account
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  </>
                )}
              </button>
            </form>

            {/* Sign in link */}
            <p style={{ textAlign: 'center', marginTop: '28px', fontFamily: 'var(--font-body)', fontSize: '14px', color: 'rgba(240,242,255,0.35)' }}>
              Already within the perimeter?{' '}
              <Link href="/login" style={{ color: '#7c3aed', fontWeight: 600, textDecoration: 'none', marginLeft: '4px' }}>Secure Log In</Link>
            </p>
          </div>
        </section>

      </main>

      {/* ── Footer ── */}
      <footer style={{ background: 'rgba(5,8,16,0.9)', borderTop: '1px solid rgba(255,255,255,0.05)', padding: '24px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, rgba(124,58,237,0.3), rgba(6,182,212,0.2))', border: '1px solid rgba(124,58,237,0.3)', boxShadow: '0 2px 10px rgba(124,58,237,0.2)', flexShrink: 0 }}>
            <VBrandMark suffix="signup-footer" size={20} />
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

export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}
