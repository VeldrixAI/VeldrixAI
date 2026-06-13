"use client";
import LiveTrustFeed from "./LiveTrustFeed";
import { ShieldMark } from "@/components/shield-mark";

function VeldrixLogoMark({ size = 32 }: { size?: number }) {
  return <ShieldMark size={size} />;
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
  { label: 'Sub-500ms evaluation' },
  { label: 'Append-only audit log' },
  { label: 'SOC 2 architecture' },
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
          background: 'linear-gradient(135deg, #fff 0%, #c5cfd5 60%, #abc8bd 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          lineHeight: 1,
        }}>VeldrixAI</h1>
        <p style={{
          fontFamily: 'var(--font-body)',
          fontSize: 13,
          color: 'rgba(231,236,239,0.45)',
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
          background: 'linear-gradient(90deg, rgba(45,74,94,0.4), rgba(170,184,192,0.2), transparent)',
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
              color: 'rgba(231,236,239,0.45)',
              fontFamily: 'var(--font-body)',
            }}>
              <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'rgba(45,74,94,0.6)', flexShrink: 0 }} />
              <span>{stat.label}</span>
            </div>
          ))}
        </div>
      </AnimatedItem>
    </div>
  );
}
