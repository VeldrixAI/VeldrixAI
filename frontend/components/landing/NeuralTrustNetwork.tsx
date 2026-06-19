"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

/**
 * HeroNexus — the "trust nexus", a full-bleed, native animated SVG hero (no
 * raster art ships). A living VELDRIX core evaluates five dimensional vector
 * monuments — Safety, Hallucination, Injection, Bias, PII — spread wide across
 * the section, with DNA double-helix energy currents flowing between the core
 * and each pillar.
 *
 * Highlights:
 *  - cinematic one-time ignition (core flash + shockwave, currents racing out
 *    one-by-one, pillars bursting + popping into place);
 *  - DNA-helix currents (two woven strands + base-pair rungs + an energy crest);
 *  - a core shield HEARTBEAT that pumps in rhythm with the currents;
 *  - shaded, emissive 3D monuments (lit/shadow facets, inner glow, contact
 *    shadows, edge highlights);
 *  - perpetual breath, per-monument idle float, pointer parallax depth, and a
 *    glassy pointer-following specular on the core orb.
 *
 * Pointer transforms are gated behind `mounted`, and all generated geometry is
 * deterministic, so SSR and the first client render are byte-identical.
 *
 * Export name / props are preserved so the landing page import is unchanged.
 */

const VBW = 1600;
const VBH = 1000;
const CORE = { x: 800, y: 500 } as const;
const MON_SCALE = 1.42;

/* ── Deterministic PRNG (mulberry32) — identical on server & client ──────── */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── Honeycomb circuit field for the full-bleed background ───────────────── */
function hexPoints(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let k = 0; k < 6; k++) {
    const a = (Math.PI / 180) * (60 * k);
    pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(" ");
}
function genHexes(w: number, h: number, r: number): string[] {
  const out: string[] = [];
  const dx = 1.5 * r;
  const dy = Math.sqrt(3) * r;
  const cols = Math.ceil(w / dx) + 2;
  const rows = Math.ceil(h / dy) + 2;
  for (let c = -1; c <= cols; c++) {
    for (let ro = -1; ro <= rows; ro++) {
      const cx = c * dx;
      const cy = ro * dy + (Math.abs(c) % 2 ? dy / 2 : 0);
      out.push(hexPoints(cx, cy, r - 5));
    }
  }
  return out;
}
const HEXES_BG = genHexes(1600, 1000, 54);

/* ── Drifting wave particles (dense, slow, dreamy ambient current) ───────── */
const PCOLORS = ["180,220,245", "167,232,200", "207,226,238", "235,207,148", "242,162,147"];
interface Particle {
  left: number; top: number; size: number; dur: number; delay: number; dx: number; op: number; color: string;
}
const PARTICLES: Particle[] = (() => {
  const rnd = mulberry32(0x5e1d11);
  return Array.from({ length: 68 }, () => {
    const pick = rnd();
    const ci = pick < 0.52 ? 0 : pick < 0.74 ? 2 : pick < 0.9 ? 1 : pick < 0.96 ? 3 : 4;
    return {
      left: +(rnd() * 100).toFixed(2),
      top: +(20 + rnd() * 80).toFixed(2),
      size: +(2 + rnd() * 5).toFixed(2),
      dur: +(26 + rnd() * 28).toFixed(2),
      delay: +(-rnd() * 50).toFixed(2),
      dx: +((rnd() - 0.5) * 90).toFixed(1),
      op: +(0.2 + rnd() * 0.42).toFixed(2),
      color: PCOLORS[ci],
    };
  });
})();

/* ── Pillar definitions ──────────────────────────────────────────────────────
   `id` drives the monument SHAPE + gradients; `label` is the real Veldrix
   evaluation pillar (mapped off the reference image's placeholder names):
     crystal  → Safety        obelisk → Hallucination   fortress → Injection
     scales   → Bias          ledger  → PII                                    */
interface Pillar {
  id: string;
  label: string;
  color: string;
  hot: string;
  cx: number;
  cy: number;
  lx: number;
  ly: number;
  anchor: { x: number; y: number };
  dur: number;
  depth: number;
  fdur: number;
  fdelay: number;
  rdelay: number;
}

const PILLARS: Pillar[] = [
  { id: "safety",     label: "SAFETY",        color: "#6FA98F", hot: "#A7E8C8", cx: 252,  cy: 286, lx: 252,  ly: 74,  anchor: { x: 322,  y: 360 }, dur: 2.6,  depth: 26, fdur: 6.0, fdelay: 0,    rdelay: 1.75 },
  { id: "factuality", label: "HALLUCINATION", color: "#AAB8C0", hot: "#EAF2F6", cx: 1348, cy: 286, lx: 1348, ly: 74,  anchor: { x: 1278, y: 360 }, dur: 2.95, depth: 23, fdur: 6.6, fdelay: -1.4, rdelay: 2.05 },
  { id: "security",   label: "INJECTION",     color: "#BE7468", hot: "#F2A293", cx: 244,  cy: 736, lx: 244,  ly: 918, anchor: { x: 318,  y: 700 }, dur: 2.35, depth: 36, fdur: 5.6, fdelay: -2.2, rdelay: 1.20 },
  { id: "equity",     label: "BIAS",          color: "#C2A06A", hot: "#EBCF94", cx: 1356, cy: 736, lx: 1356, ly: 918, anchor: { x: 1282, y: 700 }, dur: 2.8,  depth: 33, fdur: 6.2, fdelay: -0.7, rdelay: 1.45 },
  { id: "compliance", label: "PII",           color: "#8FA6B5", hot: "#CFE2EE", cx: 800,  cy: 778, lx: 800,  ly: 984, anchor: { x: 800,  y: 700 }, dur: 3.15, depth: 40, fdur: 7.0, fdelay: -3.1, rdelay: 0.90 },
];

/* ── Straight centerline (energy crest + ignition tracer) ────────────────── */
function ribbonPath(end: { x: number; y: number }, offset: number): string {
  const s = CORE;
  const mx = (s.x + end.x) / 2;
  const my = (s.y + end.y) / 2;
  const dx = end.x - s.x;
  const dy = end.y - s.y;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len;
  const py = dx / len;
  return `M${s.x},${s.y} Q${(mx + px * offset).toFixed(1)},${(my + py * offset).toFixed(1)} ${end.x},${end.y}`;
}

/* ── DNA double-helix between core and a pillar ──────────────────────────────
   Two sine strands 180° out of phase (they cross at nodes) with an amplitude
   envelope that tapers to zero at both ends, plus base-pair rungs. */
interface Helix { a: string; b: string; rungs: { x1: number; y1: number; x2: number; y2: number; o: number }[]; }
function helixStrands(end: { x: number; y: number }, amp: number, waves: number, samples: number): Helix {
  const s = CORE;
  const dx = end.x - s.x;
  const dy = end.y - s.y;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len;
  const py = dx / len;
  const ptsA: string[] = [];
  const ptsB: string[] = [];
  const rungs: Helix["rungs"] = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const env = Math.sin(t * Math.PI); // 0 at ends, 1 mid
    const off = amp * env * Math.sin(t * waves * Math.PI * 2);
    const bx = s.x + dx * t;
    const by = s.y + dy * t;
    const ax = (bx + px * off).toFixed(1);
    const ay = (by + py * off).toFixed(1);
    const cx = (bx - px * off).toFixed(1);
    const cy = (by - py * off).toFixed(1);
    ptsA.push(`${i ? "L" : "M"}${ax},${ay}`);
    ptsB.push(`${i ? "L" : "M"}${cx},${cy}`);
    if (i % 4 === 0 && env > 0.25) {
      rungs.push({ x1: +ax, y1: +ay, x2: +cx, y2: +cy, o: +(0.15 + env * 0.35).toFixed(2) });
    }
  }
  return { a: ptsA.join(" "), b: ptsB.join(" "), rungs };
}
const HELIX: Record<string, Helix> = Object.fromEntries(
  PILLARS.map((p) => [p.id, helixStrands(p.anchor, 17, 3, 46)])
);

/* ── Shaded, emissive 3D vector monuments (light from upper-left) ────────── */
function Monument({ id, hot }: { id: string; hot: string }) {
  const lit = `url(#nx-fill-${id})`;
  const side = `url(#nx-side-${id})`;
  const ground = (
    <>
      <ellipse cx={2} cy={118} rx={64} ry={14} fill="rgba(0,0,0,0.55)" filter="url(#nx-soft)" />
      <ellipse cx={0} cy={106} rx={72} ry={15} fill={`url(#nx-glow-${id})`} className="nx-base" />
    </>
  );
  const pedestal = (
    <g>
      <polygon points="-50,106 -32,90 32,90 50,106 32,118 -32,118" fill={side} stroke={hot} strokeWidth={1.4} />
      <polygon points="-50,106 -32,90 32,90 50,106" fill={lit} />
      <line x1={-32} y1={90} x2={32} y2={90} stroke={hot} strokeWidth={1.2} opacity={0.55} />
    </g>
  );

  switch (id) {
    case "safety": // emerald crystal spire — emissive core, faceted, check seal
      return (
        <g className="nx-mon">
          {ground}
          <polygon points="0,-150 -44,-22 0,90 44,-22" fill={hot} opacity={0.22} filter="url(#nx-soft)" />
          {pedestal}
          <polygon points="0,-150 -44,-22 0,90" fill={lit} stroke={hot} strokeWidth={1.6} />
          <polygon points="0,-150 44,-22 0,90" fill={side} stroke={hot} strokeWidth={1.6} />
          <polygon points="0,-150 -22,-66 0,-26 22,-66" fill={hot} opacity={0.5} />
          <line x1={0} y1={-150} x2={0} y2={90} stroke="#ffffff" strokeWidth={1.4} opacity={0.6} filter="url(#nx-glow)" />
          <line x1={0} y1={-150} x2={-44} y2={-22} stroke="#ffffff" strokeWidth={1.6} opacity={0.7} filter="url(#nx-glow)" />
          <path d="M0,-168 L5,-150 L0,-138 L-5,-150 Z" fill="#ffffff" className="nx-spark" />
          <circle cx={0} cy={18} r={17} fill="#06231a" stroke={hot} strokeWidth={2.6} filter="url(#nx-glow)" />
          <path d="M-8,18 L-1,26 L10,9" fill="none" stroke={hot} strokeWidth={3.6} strokeLinecap="round" strokeLinejoin="round" />
        </g>
      );
    case "factuality": // platinum obelisk — pyramidal cap, data etch, specular sheen
      return (
        <g className="nx-mon">
          {ground}
          <polygon points="0,-156 -24,-108 -19,90 19,90 24,-108" fill={hot} opacity={0.18} filter="url(#nx-soft)" />
          {pedestal}
          <polygon points="0,-156 -24,-108 -19,90 0,90" fill={lit} stroke={hot} strokeWidth={1.6} />
          <polygon points="0,-156 24,-108 19,90 0,90" fill={side} stroke={hot} strokeWidth={1.6} />
          <polygon points="0,-156 -24,-108 0,-100" fill="#ffffff" opacity={0.4} />
          <rect x={-13} y={-86} width={9} height={150} fill="#ffffff" opacity={0.16} />
          {[-78, -52, -24, 6, 38, 66].map((y) => (
            <line key={y} x1={-15} y1={y} x2={-3} y2={y + 1.5} stroke={hot} strokeWidth={1.4} opacity={0.5} />
          ))}
          <line x1={0} y1={-156} x2={-24} y2={-108} stroke="#ffffff" strokeWidth={1.5} opacity={0.75} filter="url(#nx-glow)" />
          <line x1={0} y1={-156} x2={0} y2={90} stroke="#ffffff" strokeWidth={0.9} opacity={0.4} />
          <path d="M0,-172 L4,-156 L0,-146 L-4,-156 Z" fill="#ffffff" className="nx-spark" />
        </g>
      );
    case "security": // crimson keep — boxy 3D, crenellations, arrow-slits, padlock
      return (
        <g className="nx-mon">
          {ground}
          <rect x={-46} y={-48} width={108} height={142} rx={6} fill={hot} opacity={0.16} filter="url(#nx-soft)" />
          {pedestal}
          <polygon points="-42,90 -42,-18 38,-18 38,90" fill={lit} stroke={hot} strokeWidth={1.6} />
          <polygon points="38,-18 56,-34 56,74 38,90" fill={side} stroke={hot} strokeWidth={1.6} />
          <polygon points="-42,-18 -24,-34 56,-34 38,-18" fill={lit} opacity={0.85} stroke={hot} strokeWidth={1.2} />
          <path d="M-42,-18 V-44 H-26 V-30 H-8 V-44 H8 V-30 H26 V-44 H38 V-18 Z" fill={lit} stroke={hot} strokeWidth={1.6} />
          {[14, 42, 70].map((y) => (
            <line key={y} x1={-40} y1={y} x2={36} y2={y} stroke="#000" strokeWidth={1} opacity={0.3} />
          ))}
          <rect x={-26} y={6} width={6} height={20} rx={2} fill={hot} opacity={0.9} filter="url(#nx-glow)" />
          <rect x={20} y={6} width={6} height={20} rx={2} fill={hot} opacity={0.9} filter="url(#nx-glow)" />
          <path d="M-14,30 A14,14 0 0 1 14,30" fill="none" stroke={hot} strokeWidth={4.6} />
          <rect x={-21} y={30} width={42} height={36} rx={6} fill="#2a0f0c" stroke={hot} strokeWidth={2.6} filter="url(#nx-glow)" />
          <circle cx={0} cy={45} r={5} fill={hot} />
          <line x1={0} y1={45} x2={0} y2={57} stroke={hot} strokeWidth={3.4} strokeLinecap="round" />
        </g>
      );
    case "equity": // polished golden scales — ornate base, chained pans, finial
      return (
        <g className="nx-mon">
          {ground}
          <circle cx={0} cy={-46} r={78} fill={hot} opacity={0.13} filter="url(#nx-soft)" />
          {pedestal}
          <polygon points="-26,90 -20,52 20,52 26,90" fill={lit} stroke={hot} strokeWidth={1.8} />
          <polygon points="20,52 28,46 28,84 26,90" fill={side} />
          <rect x={-6} y={-84} width={12} height={136} rx={3} fill={lit} stroke={hot} strokeWidth={1.4} />
          <rect x={2} y={-84} width={4} height={136} fill={side} />
          <path d="M0,-100 L8,-84 L0,-76 L-8,-84 Z" fill="#ffffff" className="nx-spark" />
          <circle cx={0} cy={-84} r={6} fill={hot} />
          <line x1={-72} y1={-66} x2={72} y2={-66} stroke={hot} strokeWidth={6} strokeLinecap="round" />
          <line x1={-72} y1={-69} x2={72} y2={-69} stroke="#ffffff" strokeWidth={1.4} opacity={0.6} strokeLinecap="round" />
          <circle cx={0} cy={-66} r={7} fill="#2e2410" stroke={hot} strokeWidth={2} filter="url(#nx-glow)" />
          {[-66, 66].map((bx) => (
            <g key={bx}>
              <line x1={bx} y1={-66} x2={bx - Math.sign(bx) * 24} y2={-30} stroke={hot} strokeWidth={1.6} opacity={0.75} />
              <line x1={bx} y1={-66} x2={bx + Math.sign(bx) * 24} y2={-30} stroke={hot} strokeWidth={1.6} opacity={0.75} />
              <circle cx={bx} cy={-55} r={2.6} fill={hot} />
              <path d={`M${bx - 26},-30 Q${bx},10 ${bx + 26},-30`} fill="#2e2410" stroke={hot} strokeWidth={2.6} />
              <path d={`M${bx - 26},-30 Q${bx},6 ${bx + 26},-30`} fill="none" stroke="#ffffff" strokeWidth={1} opacity={0.4} />
            </g>
          ))}
        </g>
      );
    case "compliance": // steel ledger resting ON its pedestal — open book + bookmark
      return (
        <g className="nx-mon">
          {ground}
          <polygon points="0,12 -44,0 -44,88 44,88 44,0" fill={hot} opacity={0.16} filter="url(#nx-soft)" />
          {pedestal}
          {/* page-block thickness sits on the pedestal top (y≈90) */}
          <polygon points="-44,72 0,62 44,72 44,88 0,78 -44,88" fill={side} stroke={hot} strokeWidth={1.4} />
          {/* open pages */}
          <polygon points="0,12 -44,0 -44,70 0,60" fill={lit} stroke={hot} strokeWidth={2} />
          <polygon points="0,12 44,0 44,70 0,60" fill={side} stroke={hot} strokeWidth={2} />
          <line x1={0} y1={12} x2={0} y2={60} stroke={hot} strokeWidth={2.4} />
          {[18, 30, 42, 54].map((y, i) => (
            <React.Fragment key={i}>
              <line x1={-34} y1={y} x2={-9} y2={y + 3} stroke={hot} strokeWidth={1.3} opacity={0.5} />
              <line x1={9} y1={y + 3} x2={34} y2={y} stroke={hot} strokeWidth={1.3} opacity={0.5} />
            </React.Fragment>
          ))}
          <line x1={0} y1={12} x2={-44} y2={0} stroke="#ffffff" strokeWidth={1.2} opacity={0.55} />
          <path d="M0,12 L0,90 L-7,79 L-14,90 L-14,8 Z" fill={hot} opacity={0.9} className="nx-spark" />
        </g>
      );
    default:
      return null;
  }
}

export function NeuralTrustNetwork({ reduced }: { reduced: boolean }) {
  const [mounted, setMounted] = useState(false);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const raf = useRef<number | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, []);

  const onMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (reduced) return;
      const r = e.currentTarget.getBoundingClientRect();
      const nx = (e.clientX - r.left) / r.width - 0.5;
      const ny = (e.clientY - r.top) / r.height - 0.5;
      if (raf.current) cancelAnimationFrame(raf.current);
      raf.current = requestAnimationFrame(() => setTilt({ x: nx, y: ny }));
    },
    [reduced]
  );
  const onLeave = useCallback(() => setTilt({ x: 0, y: 0 }), []);

  const activeP = mounted && !reduced;
  const parallax = (depth: number): React.CSSProperties =>
    activeP ? { transform: `translate(${(tilt.x * depth).toFixed(2)}px, ${(tilt.y * depth).toFixed(2)}px)` } : {};
  const specular: React.CSSProperties = activeP
    ? { transform: `translate(${(tilt.x * 56).toFixed(1)}px, ${(tilt.y * 46).toFixed(1)}px)` }
    : {};

  return (
    <div className="nexus-hero" onPointerMove={onMove} onPointerLeave={onLeave}>
      {/* Full-bleed honeycomb circuit field */}
      <div className="nexus-bg" aria-hidden="true">
        <svg className="nexus-bg-svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice">
          {HEXES_BG.map((pts, i) => (
            <polygon key={i} points={pts} fill="none" stroke="rgba(143,166,181,0.11)" strokeWidth={1} />
          ))}
        </svg>
      </div>

      {/* Full-bleed drifting wave particles */}
      {!reduced && (
        <div className="nexus-particles" aria-hidden="true">
          {PARTICLES.map((p, i) => (
            <span
              key={i}
              className="nexus-particle"
              style={{
                left: `${p.left}%`,
                top: `${p.top}%`,
                width: `${p.size}px`,
                height: `${p.size}px`,
                background: `radial-gradient(circle, rgba(${p.color},0.95), rgba(${p.color},0) 70%)`,
                animationDuration: `${p.dur}s`,
                animationDelay: `${p.delay}s`,
                ["--dx" as string]: `${p.dx}px`,
                ["--op" as string]: p.op,
              } as React.CSSProperties}
            />
          ))}
        </div>
      )}

      {/* Panoramic trust composition */}
      <div className="nexus-composition">
        <svg className="nexus-svg" viewBox={`0 0 ${VBW} ${VBH}`} role="img"
          aria-label="The Veldrix trust nexus — a central core evaluating five pillars: safety, hallucination, injection, bias, and PII.">
          <defs>
            <filter id="nx-soft" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="6" />
            </filter>
            <filter id="nx-glow" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="3.2" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="nx-bloom" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="9" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            <radialGradient id="nx-core-aura" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#CFEFFF" stopOpacity="0.95" />
              <stop offset="30%" stopColor="#5FB4E4" stopOpacity="0.6" />
              <stop offset="64%" stopColor="#2D4A5E" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#2D4A5E" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="nx-core-fill" x1="0" y1="0" x2="0.7" y2="1">
              <stop offset="0%" stopColor="#BFEEFF" />
              <stop offset="45%" stopColor="#3E83AC" />
              <stop offset="100%" stopColor="#10262F" />
            </linearGradient>
            <radialGradient id="nx-spec" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.92" />
              <stop offset="45%" stopColor="#CFEFFF" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#CFEFFF" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="nx-flash" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
              <stop offset="35%" stopColor="#CFEFFF" stopOpacity="0.85" />
              <stop offset="70%" stopColor="#5FB4E4" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#5FB4E4" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="nx-heart" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#EAF8FF" stopOpacity="0.9" />
              <stop offset="55%" stopColor="#5FB4E4" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#5FB4E4" stopOpacity="0" />
            </radialGradient>
            <clipPath id="nx-core-clip">
              <polygon points={hexPoints(CORE.x, CORE.y, 94)} />
            </clipPath>

            {PILLARS.map((p) => (
              <React.Fragment key={p.id}>
                <linearGradient id={`nx-fill-${p.id}`} x1="0" y1="0" x2="0.8" y2="1">
                  <stop offset="0%" stopColor={p.hot} />
                  <stop offset="50%" stopColor={p.color} />
                  <stop offset="100%" stopColor="#0a0f13" />
                </linearGradient>
                <linearGradient id={`nx-side-${p.id}`} x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor={p.color} />
                  <stop offset="55%" stopColor="#0c1418" />
                  <stop offset="100%" stopColor="#06090d" />
                </linearGradient>
                <radialGradient id={`nx-glow-${p.id}`} cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor={p.hot} stopOpacity="0.85" />
                  <stop offset="55%" stopColor={p.color} stopOpacity="0.3" />
                  <stop offset="100%" stopColor={p.color} stopOpacity="0" />
                </radialGradient>
              </React.Fragment>
            ))}
          </defs>

          {/* Whole scene breathes + ignition zoom on load. */}
          <g className="nexus-scene">
            {/* DNA-helix energy currents — race outward one-by-one on ignition */}
            <g className="nexus-layer nexus-ribbons" style={parallax(15)}>
              {PILLARS.map((p) => {
                const cdelay = p.rdelay + 0.55;
                const hx = HELIX[p.id];
                return (
                  <g key={p.id}>
                    <path d={ribbonPath(p.anchor, 0)} fill="none" stroke={p.color} strokeWidth={16}
                      opacity={0.1} filter="url(#nx-soft)" />
                    {!reduced && (
                      <>
                        {/* one-shot tracer racing core → pillar during ignition */}
                        <path className="nx-tracer" d={ribbonPath(p.anchor, 0)} fill="none" stroke={p.hot}
                          strokeWidth={6} strokeLinecap="round" pathLength={100} filter="url(#nx-bloom)"
                          style={{ ["--rdelay" as string]: `${p.rdelay}s` } as React.CSSProperties} />
                        {/* perpetual DNA current, revealed as the tracer lands */}
                        <g className="nx-current" style={{ ["--cdelay" as string]: `${cdelay}s` } as React.CSSProperties}>
                          {hx.rungs.map((r, i) => (
                            <line key={i} className="nx-rung" x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2}
                              stroke={p.hot} strokeWidth={1.5} opacity={r.o}
                              style={{ animationDelay: `${(i * 0.12).toFixed(2)}s` }} />
                          ))}
                          <path className="nx-helix" d={hx.a} fill="none" stroke={p.color} strokeWidth={2.4}
                            pathLength={100} filter="url(#nx-glow)" style={{ animationDuration: `${(p.dur * 1.8).toFixed(2)}s` }} />
                          <path className="nx-helix nx-helix-rev" d={hx.b} fill="none" stroke={p.hot} strokeWidth={2.2}
                            pathLength={100} filter="url(#nx-glow)" style={{ animationDuration: `${(p.dur * 1.8).toFixed(2)}s` }} />
                          <path className="nx-flow-halo" d={ribbonPath(p.anchor, 0)} fill="none" stroke={p.hot}
                            strokeWidth={9} strokeLinecap="round" pathLength={100} filter="url(#nx-bloom)"
                            style={{ animationDuration: `${p.dur}s` }} />
                          <path className="nx-flow" d={ribbonPath(p.anchor, 0)} fill="none" stroke={p.hot}
                            strokeWidth={3.4} strokeLinecap="round" pathLength={100} filter="url(#nx-glow)"
                            style={{ animationDuration: `${p.dur}s` }} />
                          <path className="nx-filament" d={ribbonPath(p.anchor, 0)} fill="none" stroke="#ffffff"
                            strokeWidth={1.4} strokeLinecap="round" pathLength={100} filter="url(#nx-glow)"
                            style={{ animationDuration: `${p.dur}s`, animationDelay: `${p.dur * 0.2}s` }} />
                        </g>
                      </>
                    )}
                  </g>
                );
              })}
            </g>

            {/* Monuments + labels: own parallax depth, idle float, ignition pop + burst */}
            {PILLARS.map((p) => (
              <g key={p.id} className="nexus-layer" style={parallax(p.depth)}>
                {!reduced && (
                  <circle className="nexus-pillar-burst" cx={p.cx} cy={p.cy - 30} r={120}
                    fill={`url(#nx-glow-${p.id})`}
                    style={{ ["--idelay" as string]: `${p.rdelay + 0.45}s` } as React.CSSProperties} />
                )}
                <g className="nexus-ignite" style={{ ["--idelay" as string]: `${p.rdelay + 0.5}s` } as React.CSSProperties}>
                  <g className="nexus-float" style={{ animationDuration: `${p.fdur}s`, animationDelay: `${p.fdelay}s` }}>
                    <g transform={`translate(${p.cx},${p.cy}) scale(${MON_SCALE})`}>
                      <Monument id={p.id} hot={p.hot} />
                    </g>
                    <text className="nexus-text nexus-text-pillar" x={p.lx} y={p.ly} textAnchor="middle"
                      fill={p.color} style={{ filter: reduced ? undefined : "url(#nx-glow)" }}>
                      {p.label}
                    </text>
                  </g>
                </g>
              </g>
            ))}

            {/* Living core (anchored; barely parallaxes; flash on ignition, then heartbeat) */}
            <g className="nexus-layer nexus-core-layer" style={parallax(6)}>
              {!reduced && (
                <>
                  <circle className="nexus-flash" cx={CORE.x} cy={CORE.y} r={240} fill="url(#nx-flash)" />
                  <circle className="nexus-bigshock" cx={CORE.x} cy={CORE.y} r={110} fill="none" stroke="#CFEFFF" strokeWidth={3} />
                  <circle className="nexus-pulse-ring" cx={CORE.x} cy={CORE.y} r={100} fill="none" stroke="#7FD0F0" strokeWidth={2.4} />
                </>
              )}
              <circle className="nexus-core-aura" cx={CORE.x} cy={CORE.y} r={185} fill="url(#nx-core-aura)" />
              <circle className="nexus-core-ring" cx={CORE.x} cy={CORE.y} r={122} fill="none" stroke="#8FD6FA"
                strokeWidth={1.8} strokeDasharray="3 10" opacity={0.6} filter="url(#nx-glow)" />
              <g filter="url(#nx-glow)">
                <polygon points={hexPoints(CORE.x, CORE.y, 94)} fill="url(#nx-core-fill)" stroke="#9FE0FF" strokeWidth={2.8} />
                {hexPoints(CORE.x, CORE.y, 94).split(" ").map((pt, i) => {
                  const [vx, vy] = pt.split(",");
                  return <line key={i} x1={CORE.x} y1={CORE.y} x2={vx} y2={vy} stroke="#9FE0FF" strokeWidth={0.9} opacity={0.32} />;
                })}
                <polygon points={hexPoints(CORE.x, CORE.y, 55)} fill="#13303C" stroke="#9FE0FF" strokeWidth={1.6} opacity={0.9} />
              </g>
              <g clipPath="url(#nx-core-clip)">
                <ellipse className="nexus-specular" cx={CORE.x - 26} cy={CORE.y - 32} rx={56} ry={40}
                  fill="url(#nx-spec)" style={specular} />
              </g>
              {/* Heartbeat glow pumps over the orb in rhythm with the currents. */}
              {!reduced && <circle className="nexus-heart-glow" cx={CORE.x} cy={CORE.y} r={120} fill="url(#nx-heart)" />}
              <image href="/veldrix-shield.png" x={CORE.x - 50} y={CORE.y - 50} width={100} height={100} className="nexus-shield" />
            </g>
          </g>
        </svg>
      </div>
    </div>
  );
}
