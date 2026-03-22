"use client";
import LiveTrustFeed from "./LiveTrustFeed";

function VeldrixLogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="auth-vg" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95"/>
          <stop offset="100%" stopColor="#a78bfa"/>
        </linearGradient>
        <linearGradient id="auth-bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.35"/>
          <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.18"/>
        </linearGradient>
      </defs>
      <rect x="8" y="8" width="84" height="84" rx="18" fill="url(#auth-bg)" stroke="#7c3aed" strokeWidth="1" strokeOpacity="0.5"/>
      <path d="M24 30 L50 70 L76 30" fill="none" stroke="url(#auth-vg)" strokeWidth="7.5" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="50" cy="70" r="5" fill="#06b6d4"/>
      <circle cx="50" cy="70" r="2.5" fill="white"/>
      <rect x="30" y="47" width="12" height="2.5" rx="1.25" fill="#a78bfa" opacity="0.65"/>
      <rect x="58" y="47" width="12" height="2.5" rx="1.25" fill="#67e8f9" opacity="0.65"/>
    </svg>
  );
}

function AnimatedItem({
  children,
  delay,
  style,
}: {
  children: React.ReactNode;
  delay: number;
  style?: React.CSSProperties;
}) {
  return (
    <div style={{
      animation: `authItemReveal 0.6s cubic-bezier(0.16,1,0.3,1) ${delay}s both`,
      ...style,
    }}>
      {children}
    </div>
  );
}

const STATS = [
  { icon: '⚡', label: '<200ms latency' },
  { icon: '🛡️', label: '99.9% uptime' },
  { icon: '🔒', label: 'SOC 2 Ready' },
];

export default function AuthLeftDefault() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-start',
      justifyContent: 'center',
      height: '100%',
      padding: '60px 64px',
      maxWidth: 520,
    }}>
      <style>{`
        @keyframes authItemReveal {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Logo mark */}
      <AnimatedItem delay={0}>
        <VeldrixLogoMark size={72} />
      </AnimatedItem>

      {/* Wordmark */}
      <AnimatedItem delay={0.1} style={{ marginTop: 20 }}>
        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 800,
          fontSize: 40,
          margin: 0,
          background: 'linear-gradient(135deg, #fff 0%, #a78bfa 60%, #67e8f9 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          lineHeight: 1,
        }}>VeldrixAI</h1>
        <p style={{
          fontFamily: 'var(--font-body)',
          fontSize: 13,
          color: 'rgba(240,242,255,0.45)',
          margin: '8px 0 0',
          textTransform: 'uppercase',
          letterSpacing: '0.14em',
          fontWeight: 500,
        }}>Runtime Trust Infrastructure</p>
      </AnimatedItem>

      {/* Separator */}
      <AnimatedItem delay={0.2} style={{ width: '100%', marginTop: 28 }}>
        <div style={{
          width: '100%',
          height: 1,
          background: 'linear-gradient(90deg, rgba(124,58,237,0.4), rgba(6,182,212,0.2), transparent)',
        }} />
      </AnimatedItem>

      {/* Live Trust Feed */}
      <AnimatedItem delay={0.3} style={{ width: '100%', marginTop: 24 }}>
        <LiveTrustFeed />
      </AnimatedItem>

      {/* Stats */}
      <AnimatedItem delay={0.45} style={{ marginTop: 24 }}>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          {STATS.map(stat => (
            <div key={stat.label} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              color: 'rgba(240,242,255,0.55)',
              fontFamily: 'var(--font-body)',
            }}>
              <span>{stat.icon}</span>
              <span>{stat.label}</span>
            </div>
          ))}
        </div>
      </AnimatedItem>
    </div>
  );
}
