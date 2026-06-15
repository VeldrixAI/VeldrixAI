"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ── Types ─────────────────────────────────────────────────────────────────────
interface LatencyPoint {
  p50: number;
  p99: number;
  timestamp: number;
}

interface Packet {
  id: number;
  x: number;
  layer: number;
  transform: "raw" | "signed";
  opacity: number;
}

// ── Glass Panel Component ──────────────────────────────────────────────────────
function GlassPanel({
  children,
  className = "",
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return <div className={`lp-glass-panel ${className}`}>{children}</div>;
}

// ── Oscilloscope Graph ─────────────────────────────────────────────────────────
function OscilloscopeGraph({ data }: { data: LatencyPoint[] }) {
  const width = 240;
  const height = 48;
  const padding = 4;
  const graphWidth = width - padding * 2;
  const graphHeight = height - padding * 2;
  const maxLatency = Math.max(...data.map((d) => d.p99), 500);
  const points = data.slice(-30);

  const p50Path = points
    .map((p, i) => {
      const x = padding + (i / (points.length - 1 || 1)) * graphWidth;
      const y = padding + graphHeight - (p.p50 / maxLatency) * graphHeight;
      return `${i === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");

  const p99Path = points
    .map((p, i) => {
      const x = padding + (i / (points.length - 1 || 1)) * graphWidth;
      const y = padding + graphHeight - (p.p99 / maxLatency) * graphHeight;
      return `${i === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");

  return (
    <svg width={width} height={height} className="lp-oscilloscope" aria-hidden="true">
      {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => (
        <line key={i} x1={padding} y1={padding + ratio * graphHeight} x2={width - padding} y2={padding + ratio * graphHeight} stroke="rgba(45,74,94,0.08)" strokeWidth="0.5" strokeDasharray="2 2" />
      ))}
      <path d={p99Path} fill="none" stroke="rgba(170,184,192,0.4)" strokeWidth="1" />
      <path d={p50Path} fill="none" stroke="#2d4a5e" strokeWidth="1.5" />
      <text x={padding} y={height - 2} fontSize="6" fill="rgba(231,236,239,0.3)" fontFamily="JetBrains Mono, monospace">p50/p99</text>
    </svg>
  );
}

// ── Generate deterministic initial data for SSR ─────────────────────────────────
const STATIC_LATENCY_DATA: LatencyPoint[] = Array.from({ length: 20 }, (_, i) => ({
  p50: 140 + (i * 3) % 60,
  p99: 380 + (i * 7) % 200,
  timestamp: 0,
}));

// ── Main Technical Schematic Component ──────────────────────────────────────────
export function TechnicalSchematic({ reduced }: { reduced: boolean }) {
  const [mounted, setMounted] = useState(false);
  const [packets, setPackets] = useState<Packet[]>([]);
  const [latencyData, setLatencyData] = useState<LatencyPoint[]>(STATIC_LATENCY_DATA);
  const [activeLayer, setActiveLayer] = useState(0);
  const [metrics, setMetrics] = useState({ currentLatency: 0, trustScore: 0, sha256: "" });
  const packetIdRef = useRef(0);

  // Set mounted after hydration
  useEffect(() => {
    setMounted(true);
    setLatencyData(Array.from({ length: 20 }, () => ({
      p50: 140 + Math.random() * 60,
      p99: 380 + Math.random() * 200,
      timestamp: Date.now(),
    })));
  }, []);

  const spawnPacket = useCallback(() => {
    setPackets((prev) => [...prev.slice(-6), { id: ++packetIdRef.current, x: 0, layer: 0, transform: "raw", opacity: 1 }]);
  }, []);

  useEffect(() => {
    if (reduced) return;
    const spawnInterval = setInterval(spawnPacket, 2000);
    const animateInterval = setInterval(() => {
      setPackets((prev) => prev.map((p) => p.x >= 100 ? null : { ...p, x: p.x + 4, layer: Math.floor(p.x / 20), transform: Math.floor(p.x / 20) >= 4 ? "signed" : "raw", opacity: Math.floor(p.x / 20) >= 5 ? 0 : 1 }).filter(Boolean) as Packet[]);
      setActiveLayer((prev) => (prev + 1) % 6);
    }, 80);
    return () => { clearInterval(spawnInterval); clearInterval(animateInterval); };
  }, [reduced, spawnPacket]);

  useEffect(() => {
    if (reduced) return;
    const interval = setInterval(() => {
      setLatencyData((prev) => [...prev.slice(-29), { p50: 140 + Math.random() * 60, p99: 380 + Math.random() * 200, timestamp: Date.now() }]);
    }, 100);
    return () => clearInterval(interval);
  }, [reduced]);

  useEffect(() => {
    const interval = setInterval(() => {
      setMetrics({ currentLatency: Math.floor(140 + Math.random() * 80), trustScore: Math.floor(85 + Math.random() * 12), sha256: Array.from({ length: 8 }, () => Math.floor(Math.random() * 16).toString(16)).join("") });
    }, 500);
    return () => clearInterval(interval);
  }, []);

  const layers = [
    { label: "INPUT", sublabel: "raw prompt" },
    { label: "SAFETY", sublabel: "toxicity scan" },
    { label: "HALLUCINATION", sublabel: "grounding" },
    { label: "BIAS", sublabel: "fairness" },
    { label: "SECURITY", sublabel: "injection" },
    { label: "OUTPUT", sublabel: "signed" },
  ];

  return (
    <GlassPanel className="lp-schematic-container">
      <div className="lp-schematic-header">
        <span className="lp-schematic-label">INFERENCE TRACE</span>
        <span className="lp-schematic-mono">{reduced ? "STATIC" : "LIVE"}</span>
      </div>
      <div className="lp-schematic-visual">
        <svg width="100%" height="200" viewBox="0 0 320 200" preserveAspectRatio="xMidYMid meet" aria-label="Inference trace schematic">
          <defs>
            <linearGradient id="layerGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(45,74,94,0.1)" />
              <stop offset="100%" stopColor="rgba(170,184,192,0.1)" />
            </linearGradient>
            <filter id="glow"><feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          </defs>
          {layers.map((layer, i) => {
            const x = 20 + i * 50;
            const isActive = Math.floor(activeLayer) === i;
            return (
              <g key={i}>
                <rect x={x} y={40} width="40" height="100" rx="4" fill="url(#layerGrad)" stroke={isActive ? "rgba(45,74,94,0.6)" : "rgba(231,236,239,0.08)"} strokeWidth={isActive ? "1" : "0.5"} opacity={isActive ? 1 : 0.6} />
                <text x={x + 20} y={30} fontSize="7" fill={isActive ? "rgba(197,207,213,0.9)" : "rgba(231,236,239,0.35)"} textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontWeight="600">{layer.label}</text>
                <text x={x + 20} y={155} fontSize="5" fill="rgba(231,236,239,0.25)" textAnchor="middle" fontFamily="JetBrains Mono, monospace">{layer.sublabel}</text>
              </g>
            );
          })}
          <AnimatePresence>
            {!reduced && mounted && packets.map((packet) => {
              const x = 30 + (packet.x / 100) * 270;
              const y = 85 + Math.sin(packet.x * 0.1) * 8;
              return <motion.rect key={packet.id} x={x} y={y} width="8" height="8" rx="2" fill={packet.transform === "signed" ? "#aab8c0" : "#2d4a5e"} filter="url(#glow)" initial={{ opacity: 0 }} animate={{ opacity: packet.opacity }} exit={{ opacity: 0 }} />;
            })}
          </AnimatePresence>
          {[0, 1, 2, 3, 4].map((i) => (<line key={i} x1={60 + i * 50} y1={90} x2={70 + i * 50} y2={90} stroke="rgba(231,236,239,0.1)" strokeWidth="1" strokeDasharray="3 2" />))}
        </svg>
      </div>
      <div className="lp-schematic-scope"><OscilloscopeGraph data={latencyData} /></div>
      <div className="lp-schematic-metrics">
        <div className="lp-metric-item"><span className="lp-metric-label">LATENCY</span><span className="lp-metric-value">{mounted ? metrics.currentLatency : 0}ms</span></div>
        <div className="lp-metric-item"><span className="lp-metric-label">TRUST</span><span className="lp-metric-value">{mounted ? metrics.trustScore : 0}%</span></div>
        <div className="lp-metric-item lp-metric-sha"><span className="lp-metric-label">SHA256</span><span className="lp-metric-value">{mounted ? metrics.sha256 : ""}...</span></div>
      </div>
    </GlassPanel>
  );
}

// ── Calibration Plot (Hallucination) ───────────────────────────────────────────
export function CalibrationPlot() {
  const points = [{ x: 30, y: 128 }, { x: 60, y: 108 }, { x: 100, y: 85 }, { x: 140, y: 60 }, { x: 180, y: 38 }, { x: 210, y: 20 }];
  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  return (
    <svg width="100%" height="160" viewBox="0 0 240 160" aria-label="Calibration plot">
      <rect x="30" y="20" width="180" height="110" fill="rgba(255,255,255,0.02)" rx="2" />
      <line x1="30" y1="130" x2="210" y2="130" stroke="rgba(231,236,239,0.15)" strokeWidth="1" />
      <line x1="30" y1="20" x2="30" y2="130" stroke="rgba(231,236,239,0.15)" strokeWidth="1" />
      <line x1="30" y1="130" x2="210" y2="20" stroke="rgba(231,236,239,0.2)" strokeWidth="1" strokeDasharray="4 3" />
      <path d={pathD} fill="none" stroke="#2d4a5e" strokeWidth="2" />
      {points.map((p, i) => (<circle key={i} cx={p.x} cy={p.y} r="4" fill="#2d4a5e" />))}
      <text x="120" y="150" fontSize="8" fill="rgba(231,236,239,0.35)" textAnchor="middle" fontFamily="JetBrains Mono, monospace">Model Confidence →</text>
      <text x="180" y="145" fontSize="7" fill="rgba(170,184,192,0.7)" fontFamily="JetBrains Mono, monospace">ECE = 0.031</text>
    </svg>
  );
}

// ── Vector Field Heatmap (Safety) ───────────────────────────────────────────────
const STATIC_HEATMAP_CELLS = [
  [0.3, 0.5, 0.2, 0.8, 0.4, 0.6],
  [0.7, 0.4, 0.9, 0.3, 0.5, 0.8],
  [0.2, 0.6, 0.4, 0.7, 0.3, 0.5],
  [0.8, 0.3, 0.5, 0.2, 0.9, 0.4],
  [0.4, 0.7, 0.3, 0.6, 0.5, 0.8],
  [0.5, 0.2, 0.8, 0.4, 0.7, 0.3],
];

export function VectorFieldHeatmap() {
  const cells = [];
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 6; j++) {
      const intensity = STATIC_HEATMAP_CELLS[j][i];
      cells.push(<rect key={`${i}-${j}`} x={30 + i * 32} y={30 + j * 20} width="30" height="18" rx="2" fill={intensity > 0.7 ? "rgba(190,116,104,0.4)" : intensity > 0.4 ? "rgba(194,160,106,0.3)" : "rgba(111,169,143,0.2)"} />);
    }
  }
  return (
    <svg width="100%" height="160" viewBox="0 0 240 160" aria-label="Token toxicity heatmap">
      <text x="30" y="18" fontSize="8" fill="rgba(231,236,239,0.35)" fontFamily="JetBrains Mono, monospace">TOXICITY PROBABILITY DENSITY</text>
      {cells}
      <rect x="30" y="145" width="12" height="8" rx="1" fill="rgba(111,169,143,0.4)" /><text x="46" y="152" fontSize="6" fill="rgba(231,236,239,0.3)" fontFamily="JetBrains Mono, monospace">LOW</text>
      <rect x="80" y="145" width="12" height="8" rx="1" fill="rgba(194,160,106,0.4)" /><text x="96" y="152" fontSize="6" fill="rgba(231,236,239,0.3)" fontFamily="JetBrains Mono, monospace">MED</text>
      <rect x="130" y="145" width="12" height="8" rx="1" fill="rgba(190,116,104,0.4)" /><text x="146" y="152" fontSize="6" fill="rgba(231,236,239,0.3)" fontFamily="JetBrains Mono, monospace">HIGH</text>
    </svg>
  );
}

// ── RegEx Token Stream (Compliance) ─────────────────────────────────────────────
export function RegExTokenStream() {
  return (
    <svg width="100%" height="160" viewBox="0 0 240 160" aria-label="PII token detection">
      <text x="12" y="18" fontSize="8" fill="rgba(231,236,239,0.35)" fontFamily="JetBrains Mono, monospace">REGEX TOKEN STREAM</text>
      <rect x="12" y="26" width="216" height="80" rx="4" fill="rgba(255,255,255,0.02)" stroke="rgba(231,236,239,0.06)" strokeWidth="1" />
      <text x="20" y="50" fontSize="9" fill="rgba(231,236,239,0.5)" fontFamily="JetBrains Mono, monospace">Patient </text>
      <rect x="66" y="40" width="24" height="14" rx="2" fill="rgba(190,116,104,0.2)" stroke="rgba(190,116,104,0.3)" strokeWidth="0.5" />
      <text x="68" y="50" fontSize="9" fill="#be7468" fontFamily="JetBrains Mono, monospace">███</text>
      <text x="92" y="50" fontSize="9" fill="rgba(231,236,239,0.5)" fontFamily="JetBrains Mono, monospace">: </text>
      <rect x="102" y="40" width="72" height="14" rx="2" fill="rgba(190,116,104,0.2)" stroke="rgba(190,116,104,0.3)" strokeWidth="0.5" />
      <text x="104" y="50" fontSize="9" fill="#be7468" fontFamily="JetBrains Mono, monospace">███-██-████</text>
      <text x="12" y="125" fontSize="7" fill="rgba(231,236,239,0.3)" fontFamily="JetBrains Mono, monospace">PII_ENTITIES: 3 | REGEX_RULES: 47 | LATENCY: 12ms</text>
      <rect x="12" y="135" width="60" height="16" rx="3" fill="rgba(190,116,104,0.15)" stroke="rgba(190,116,104,0.3)" strokeWidth="0.5" />
      <text x="42" y="146" fontSize="7" fill="#be7468" textAnchor="middle" fontFamily="JetBrains Mono, monospace">REDACTED</text>
    </svg>
  );
}

export default TechnicalSchematic;
