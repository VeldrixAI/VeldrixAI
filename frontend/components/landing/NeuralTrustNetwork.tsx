"use client";

import React from "react";
import { PillarConstellation } from "./PillarConstellation";

/**
 * HeroNexus — the trust-nexus hero. This component owns the full-bleed BACKGROUND
 * EFFECTS only:
 *   - a honeycomb circuit field, and
 *   - dense, slow drifting wave particles.
 *
 * The central diagram (the pillar constellation + core) is rendered by
 * {@link PillarConstellation}, layered on top of these background effects. The
 * background here is deterministic (seeded PRNG), so SSR and the first client
 * render are byte-identical.
 *
 * Export name / props are preserved so the landing page import is unchanged.
 */

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

export function NeuralTrustNetwork({ reduced }: { reduced: boolean }) {
  return (
    <div className="nexus-hero">
      {/* Full-bleed honeycomb circuit field (background effect) */}
      <div className="nexus-bg" aria-hidden="true">
        <svg className="nexus-bg-svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice">
          {HEXES_BG.map((pts, i) => (
            <polygon key={i} points={pts} fill="none" stroke="rgba(143,166,181,0.11)" strokeWidth={1} />
          ))}
        </svg>
      </div>

      {/* Full-bleed drifting wave particles (background effect) */}
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

      {/* Central diagram — the Pillar Hero constellation (replaces the old core/monuments) */}
      <PillarConstellation reduced={reduced} />
    </div>
  );
}
