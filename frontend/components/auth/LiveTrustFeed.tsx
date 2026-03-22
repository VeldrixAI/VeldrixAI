"use client";
import { useEffect, useState } from "react";

const FEED_ITEMS = [
  { type: 'success', icon: '✅', text: 'Response approved · trust score 98/100', color: '#10b981' },
  { type: 'warning', icon: '⚠️', text: 'Hallucination risk detected · rewriting', color: '#f59e0b' },
  { type: 'block',   icon: '🚫', text: 'Agent action blocked · policy violation', color: '#f43f5e' },
  { type: 'success', icon: '✅', text: 'Policy compliance verified', color: '#10b981' },
  { type: 'info',    icon: '📊', text: '1,247 evaluations in last 60s', color: '#06b6d4' },
  { type: 'success', icon: '✅', text: 'Bias check passed · fairness 96/100', color: '#10b981' },
];

export default function LiveTrustFeed() {
  const [windowStart, setWindowStart] = useState(0);
  const [animKey, setAnimKey] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setWindowStart(prev => (prev + 1) % FEED_ITEMS.length);
      setAnimKey(prev => prev + 1);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  const visibleItems = [0, 1, 2].map(offset => FEED_ITEMS[(windowStart + offset) % FEED_ITEMS.length]);

  return (
    <div style={{
      background: 'rgba(8,13,26,0.9)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 16,
      padding: 20,
      width: '100%',
      maxWidth: 380,
      boxSizing: 'border-box',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 16,
      }}>
        <span style={{ fontSize: 11, color: '#06b6d4', fontFamily: 'var(--font-body)', fontVariant: 'small-caps', letterSpacing: '0.1em', fontWeight: 600 }}>
          ⚡ LIVE GOVERNANCE FEED
        </span>
        <div style={{ marginLeft: 'auto', width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} />
      </div>

      {/* Feed items */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {visibleItems.map((item, idx) => (
          <FeedItem key={`${animKey}-${idx}`} item={item} delay={idx * 60} />
        ))}
      </div>
    </div>
  );
}

function FeedItem({
  item,
  delay,
}: {
  item: typeof FEED_ITEMS[0];
  delay: number;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '8px 10px',
      borderRadius: 8,
      background: 'rgba(255,255,255,0.03)',
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(6px)',
      transition: 'opacity 300ms ease-out, transform 300ms ease-out',
    }}>
      <span style={{ fontSize: 15, lineHeight: 1, flexShrink: 0 }}>{item.icon}</span>
      <span style={{ fontSize: 12, color: 'rgba(240,242,255,0.7)', fontFamily: 'var(--font-body)', flex: 1, lineHeight: 1.4 }}>{item.text}</span>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: item.color, flexShrink: 0, opacity: 0.8 }} />
    </div>
  );
}
