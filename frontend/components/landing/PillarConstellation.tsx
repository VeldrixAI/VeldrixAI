"use client";

import React, { useEffect, useState } from "react";

/**
 * PillarConstellation — the central hero diagram (the "Pillar Hero").
 *
 * A faithful port of the standalone Claude-design animation: five holographic-etch
 * hexagon pillar nodes (Safety, Hallucination, Bias, Compliance/PII, Prompt
 * Security) orbiting a central POLICY ENGINE core, joined by curved connector
 * lines with flowing dashes, over a pulsing core glow. Treatment is "Holographic
 * Etch": conic-gradient rims, dark glass bodies, cyan etched glyphs.
 *
 * This component renders ONLY the diagram on a transparent stage — it is mounted
 * on top of the existing hero background effects (honeycomb field + drifting
 * particles), which it deliberately does not replace.
 *
 * `reduced` (prefers-reduced-motion) freezes all motion when true.
 */

const HEX = "polygon(50% 1%, 99% 25.5%, 99% 74.5%, 50% 99%, 1% 74.5%, 1% 25.5%)";
const CX = 650;
const CY = 360;

type NodeMeta = { id: string; cx: number; cy: number; label: string; sub: string };

const META: NodeMeta[] = [
  { id: "safety", cx: 300, cy: 158, label: "SAFETY", sub: "· TOXICITY" },
  { id: "hallucination", cx: 1000, cy: 158, label: "HALLUCINATION", sub: "DETECTION" },
  { id: "bias", cx: 1050, cy: 562, label: "BIAS", sub: "· FAIRNESS" },
  { id: "compliance", cx: 650, cy: 612, label: "COMPLIANCE", sub: "· PII" },
  { id: "injection", cx: 250, cy: 562, label: "PROMPT SECURITY", sub: "INJECTION" },
  { id: "center", cx: 650, cy: 360, label: "POLICY ENGINE", sub: "ENFORCEMENT CORE" },
];

const h = React.createElement;

type PathOpts = { fill?: string; stroke?: string; sw?: number; dash?: string; key: string };
const P = (d: string, o: PathOpts) =>
  h("path", {
    d,
    fill: o.fill || "none",
    stroke: o.stroke,
    strokeWidth: o.sw,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    strokeDasharray: o.dash,
    key: o.key,
  });

function glyphs(id: string, c: string, sw: number, accent: string): React.ReactNode[] {
  switch (id) {
    case "safety":
      return [
        P("M50 13 L80 24 V50 C80 71 67 83 50 91 C33 83 20 71 20 50 V24 Z", { stroke: c, sw, key: "a" }),
        P("M36 51 L46 62 L66 38", { stroke: c, sw, key: "b" }),
      ];
    case "hallucination":
      return [
        h("circle", { cx: 44, cy: 42, r: 22, fill: "none", stroke: c, strokeWidth: sw, key: "a" }),
        P("M59 57 L82 80", { stroke: c, sw: sw + 1.5, key: "b" }),
        P("M34 43 L42 51 L56 33", { stroke: c, sw: sw - 1, key: "c" }),
      ];
    case "injection":
      return [
        P("M48 18 L74 27 V49 C74 67 63 77 48 84 C33 77 22 67 22 49 V27 Z", { stroke: c, sw, key: "a" }),
        h("circle", { cx: 48, cy: 46, r: 6.5, fill: c, key: "b" }),
        P("M48 52 L44 64 L52 64 Z", { fill: c, stroke: "none", key: "c" }),
        P("M92 11 L68 29", { stroke: accent, sw: sw - 1.5, key: "d" }),
        P("M68 29 L77 30 M68 29 L67 20", { stroke: accent, sw: sw - 1.5, key: "e" }),
        P("M62 33 L57 32 M64 37 L61 41 M60 28 L62 24", { stroke: accent, sw: 2, key: "f" }),
      ];
    case "bias":
      return [
        P("M50 20 V76", { stroke: c, sw, key: "a" }),
        h("circle", { cx: 50, cy: 18, r: 3.4, fill: c, key: "b" }),
        P("M22 30 H78", { stroke: c, sw, key: "c" }),
        P("M22 30 L12 44 M22 30 L32 44", { stroke: c, sw: sw - 2, key: "d" }),
        P("M10 44 Q22 60 34 44", { stroke: c, sw, key: "e" }),
        P("M78 30 L68 44 M78 30 L88 44", { stroke: c, sw: sw - 2, key: "f" }),
        P("M66 44 Q78 60 90 44", { stroke: c, sw, key: "g" }),
        P("M40 86 H60 M44 86 L47 76 H53 L56 86", { stroke: c, sw, key: "h" }),
      ];
    case "compliance":
      return [
        h("rect", { x: 27, y: 13, width: 44, height: 64, rx: 6, fill: "none", stroke: c, strokeWidth: sw, key: "a" }),
        P("M36 30 H62", { stroke: c, sw: sw - 1.5, key: "b" }),
        h("rect", { x: 36, y: 40, width: 24, height: 8, rx: 2.5, fill: c, key: "c" }),
        P("M36 57 H53", { stroke: c, sw: sw - 1.5, key: "d" }),
        h("circle", { cx: 64, cy: 70, r: 13, fill: "#091420", stroke: c, strokeWidth: sw - 1, key: "e" }),
        P("M58 70 L63 75 L71 64", { stroke: c, sw: sw - 1, key: "f" }),
      ];
    case "center":
      return [
        P("M50 9 L85 29 L85 71 L50 91 L15 71 L15 29 Z", { stroke: c, sw, key: "a" }),
        h("circle", { cx: 50, cy: 50, r: 23, fill: "none", stroke: c, strokeWidth: sw - 1.5, strokeDasharray: "3 6", key: "b" }),
        P("M50 37 L63 50 L50 63 L37 50 Z", { stroke: c, sw, key: "c" }),
        h("circle", { cx: 50, cy: 50, r: 3.6, fill: c, key: "d" }),
        P("M50 11 V19 M50 81 V89 M17 50 H25 M75 50 H83", { stroke: c, sw: sw - 1, key: "e" }),
      ];
    default:
      return [];
  }
}

const iconSvg = (id: string, c: string, sw: number, accent: string, size: number, glow: string) =>
  h(
    "svg",
    { viewBox: "0 0 100 100", width: size, height: size, style: { display: "block", overflow: "visible", filter: glow } },
    glyphs(id, c, sw, accent)
  );

// Holographic Etch treatment (colors verbatim from the design source)
const T = {
  icon: "#86e9ff",
  sw: 4.5,
  accent: "rgba(255,150,130,.95)",
  glow: "drop-shadow(0 0 7px rgba(95,220,255,.85))",
  line: "rgba(95,220,255,.5)",
  labelColor: "#bfeeff",
  labelGlow: "0 0 16px rgba(95,220,255,.5)",
  sub2: "#5f8ea0",
  rim: {
    position: "absolute",
    inset: 0,
    clipPath: HEX,
    background: "conic-gradient(from 0deg, #5fe0ff, #7d8cff, #5fffcf, #7d8cff, #5fe0ff)",
    filter: "drop-shadow(0 0 18px rgba(95,220,255,.5))",
  } as React.CSSProperties,
  glass: {
    position: "absolute",
    inset: "2px",
    clipPath: HEX,
    background: "linear-gradient(160deg, rgba(9,20,30,.94), rgba(5,11,19,.97))",
  } as React.CSSProperties,
  facet: {
    position: "absolute",
    inset: "2px",
    clipPath: HEX,
    background:
      "linear-gradient(130deg, rgba(95,220,255,.15), transparent 48%), radial-gradient(80% 60% at 50% 8%, rgba(125,140,255,.13), transparent 60%)",
  } as React.CSSProperties,
};

const STAR_BG =
  "radial-gradient(1.6px 1.6px at 12% 20%, rgba(200,225,245,.5), transparent), radial-gradient(1.6px 1.6px at 82% 14%, rgba(200,225,245,.42), transparent), radial-gradient(1.2px 1.2px at 64% 30%, rgba(200,225,245,.35), transparent), radial-gradient(1.5px 1.5px at 30% 78%, rgba(200,225,245,.35), transparent), radial-gradient(1.1px 1.1px at 90% 70%, rgba(200,225,245,.3), transparent), radial-gradient(1.3px 1.3px at 48% 52%, rgba(200,225,245,.25), transparent)";

export function PillarConstellation({ reduced }: { reduced: boolean }) {
  const animate = !reduced;
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const fit = () => {
      const w = window.innerWidth;
      const hgt = window.innerHeight;
      setScale(Math.min(w / 1300, hgt / 740, 1.25));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  // ── Connector lines: faint base + flowing dashed overlay, core → each pillar ──
  const linePaths: React.ReactNode[] = [];
  META.filter((m) => m.id !== "center").forEach((m, idx) => {
    const mx = (CX + m.cx) / 2;
    const my = (CY + m.cy) / 2;
    const vx = m.cx - CX;
    const vy = m.cy - CY;
    const len = Math.hypot(vx, vy) || 1;
    const sign = idx % 2 ? 1 : -1;
    const px = mx + (-vy / len) * 42 * sign;
    const py = my + (vx / len) * 42 * sign;
    const d = `M${CX} ${CY} Q ${px.toFixed(0)} ${py.toFixed(0)} ${m.cx} ${m.cy}`;
    linePaths.push(
      h("path", { d, fill: "none", stroke: T.line, strokeWidth: 1, strokeOpacity: 0.35, key: "base" + idx })
    );
    linePaths.push(
      h("path", {
        d,
        fill: "none",
        stroke: T.line,
        strokeWidth: 2.4,
        strokeLinecap: "round",
        strokeDasharray: "4 8",
        key: "dash" + idx,
        style: {
          filter: `drop-shadow(0 0 5px ${T.line})`,
          animation: animate ? `pc-dashFlow ${(3 + idx * 0.3).toFixed(1)}s linear infinite` : "none",
        },
      })
    );
  });

  return (
    <div
      className="pc-stage-wrap"
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        pointerEvents: "none",
        zIndex: 3,
      }}
    >
      <style>{`
        @keyframes pc-floatY { 0%,100% { transform: translate(-50%, -50%); } 50% { transform: translate(-50%, calc(-50% - 8px)); } }
        @keyframes pc-corePulse { 0%,100% { transform: translate(-50%, -50%) scale(1); } 50% { transform: translate(-50%, -50%) scale(1.045); } }
        @keyframes pc-dashFlow { to { stroke-dashoffset: -140; } }
        @keyframes pc-glowPulse { 0%,100% { opacity:.5; transform: translate(-50%, -50%) scale(.96); } 50% { opacity:1; transform: translate(-50%, -50%) scale(1.04); } }
      `}</style>

      <div
        style={{
          position: "relative",
          width: "1300px",
          height: "740px",
          flex: "0 0 auto",
          transform: `scale(${scale})`,
          backgroundImage: STAR_BG,
          backgroundRepeat: "no-repeat",
        }}
      >
        {/* Core glow */}
        <div
          style={{
            position: "absolute",
            left: CX + "px",
            top: CY + "px",
            width: "470px",
            height: "470px",
            transform: "translate(-50%, -50%)",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(90,180,240,.2), transparent 64%)",
            pointerEvents: "none",
            zIndex: 1,
            animation: animate ? "pc-glowPulse 4.6s ease-in-out infinite" : "none",
          }}
        />

        {/* Connector lines */}
        <svg
          viewBox="0 0 1300 740"
          preserveAspectRatio="none"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 2 }}
        >
          {linePaths}
        </svg>

        {/* Nodes */}
        {META.map((m, i) => {
          const isC = m.id === "center";
          const size = isC ? 178 : 140;
          const iconSize = isC ? 96 : 72;
          const anim = !animate
            ? "none"
            : isC
              ? "pc-corePulse 4.6s ease-in-out infinite"
              : `pc-floatY ${(5.4 + (i % 3) * 0.7).toFixed(1)}s ease-in-out ${(i * 0.5).toFixed(1)}s infinite`;
          return (
            <div
              key={m.id}
              style={{
                position: "absolute",
                left: m.cx + "px",
                top: m.cy + "px",
                width: size + "px",
                height: size + "px",
                transform: "translate(-50%, -50%)",
                animation: anim,
                zIndex: isC ? 6 : 4,
              }}
            >
              <div style={T.rim} />
              <div style={T.glass} />
              <div style={T.facet} />
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  zIndex: 3,
                }}
              >
                {iconSvg(m.id, T.icon, T.sw, T.accent, iconSize, T.glow)}
              </div>
              <div
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "calc(100% + 12px)",
                  transform: "translateX(-50%)",
                  textAlign: "center",
                  whiteSpace: "nowrap",
                  zIndex: 7,
                }}
              >
                <div
                  style={{
                    fontFamily: "'Space Grotesk', var(--font-display), sans-serif",
                    fontWeight: 700,
                    fontSize: isC ? "17px" : "15px",
                    letterSpacing: ".14em",
                    color: T.labelColor,
                    textShadow: T.labelGlow,
                  }}
                >
                  {m.label}
                </div>
                <div
                  style={{
                    fontFamily: "'Space Grotesk', var(--font-display), sans-serif",
                    fontWeight: 600,
                    fontSize: "9.5px",
                    letterSpacing: ".24em",
                    color: T.sub2,
                    marginTop: "4px",
                    opacity: 0.8,
                  }}
                >
                  {m.sub}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
