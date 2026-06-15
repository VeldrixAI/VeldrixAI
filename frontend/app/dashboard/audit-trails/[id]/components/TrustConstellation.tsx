"use client";

import { useState, useRef, useEffect } from "react";

const PILLAR_KEYS   = ["safety", "hallucination", "bias", "prompt_security", "compliance"] as const;
type PillarKey = typeof PILLAR_KEYS[number];

const PILLAR_LABELS: Record<PillarKey, string> = {
  safety:          "Safety",
  hallucination:   "Hallucination",
  bias:            "Bias & Fairness",
  prompt_security: "Prompt Security",
  compliance:      "Compliance",
};

const PILLAR_COLORS: Record<PillarKey, string> = {
  safety:          "#be7468",
  hallucination:   "#2d4a5e",
  bias:            "#243b4c",
  prompt_security: "#aab8c0",
  compliance:      "#6fa98f",
};

interface NodeData {
  pillar:     PillarKey;
  score:      number | null;
  confidence: number | null;
  fired:      boolean;
  f1?:        number | null;
  precision?: number | null;
  recall?:    number | null;
  fpr?:       number | null;
  labeledN?:  number;
}

interface Props {
  pillarScores:    Record<string, number | undefined | null>;
  pillarConf:      Record<string, number | undefined | null>;
  pillarMetrics:   Record<string, {
    status: string;
    f1?: number; precision?: number; recall?: number; fpr?: number; labeled_n?: number;
  }>;
  correlations:    Record<string, number | null>;
  trustScore:      number | null;
  verdict:         string | null;
}

function pentagenPoints(cx: number, cy: number, r: number): [number, number][] {
  return PILLAR_KEYS.map((_, i) => {
    const angle = (2 * Math.PI * i) / 5 - Math.PI / 2;
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
  });
}

function corrKey(a: PillarKey, b: PillarKey): string {
  return `${a}_${b}`;
}

function edgeOpacity(corr: number | null): number {
  if (corr == null) return 0.08;
  return 0.08 + Math.abs(corr) * 0.40;
}

function edgeWidth(corr: number | null): number {
  if (corr == null) return 0.5;
  return 0.5 + Math.abs(corr) * 2.5;
}

export default function TrustConstellation({
  pillarScores,
  pillarConf,
  pillarMetrics,
  correlations,
  trustScore,
  verdict,
}: Props) {
  const [hovered, setHovered]   = useState<PillarKey | null>(null);
  const svgRef                  = useRef<SVGSVGElement>(null);

  const W = 420, H = 380;
  const cx = W / 2, cy = H / 2 - 10;
  const R = 130;

  const pts = pentagenPoints(cx, cy, R);

  const nodes: NodeData[] = PILLAR_KEYS.map((p) => {
    const score = pillarScores[p] ?? null;
    const m = pillarMetrics[p] ?? null;
    return {
      pillar:     p,
      score:      score !== undefined ? score : null,
      confidence: pillarConf[p] ?? null,
      fired:      score !== null && score < 0.5,
      f1:         m?.f1 ?? null,
      precision:  m?.precision ?? null,
      recall:     m?.recall ?? null,
      fpr:        m?.fpr ?? null,
      labeledN:   m?.labeled_n,
    };
  });

  // trustScore arrives as 0-100 (already converted by backend serializer)
  const displayScore = trustScore != null ? Math.round(trustScore) : null;
  const scoreColor =
    displayScore == null      ? "#aab8c0"
    : displayScore >= 85      ? "#6fa98f"
    : displayScore >= 60      ? "#c2a06a"
    : "#be7468";

  const hoveredNode = hovered ? nodes.find(n => n.pillar === hovered) : null;

  return (
    <div style={{ position: "relative" }}>
      <style>{`
        @keyframes node-pulse {
          0%, 100% { opacity: 0.6; }
          50%       { opacity: 1.0; }
        }
      `}</style>

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
        {/* SVG Constellation */}
        <svg
          ref={svgRef}
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          style={{ flex: "0 0 auto" }}
        >
          {/* Background circles */}
          {[0.33, 0.66, 1.0].map((scale) => (
            <circle
              key={scale}
              cx={cx} cy={cy}
              r={R * scale}
              fill="none"
              stroke="rgba(255,255,255,0.04)"
              strokeWidth={1}
            />
          ))}

          {/* Edges */}
          {PILLAR_KEYS.flatMap((a, i) =>
            PILLAR_KEYS.slice(i + 1).map((b) => {
              const key = corrKey(a, b);
              const rKey = corrKey(b, a);
              const corr = correlations[key] ?? correlations[rKey] ?? null;
              const [ax, ay] = pts[i];
              const [bx, by] = pts[PILLAR_KEYS.indexOf(b)];
              const highlighted = hovered === a || hovered === b;
              return (
                <line
                  key={key}
                  x1={ax} y1={ay} x2={bx} y2={by}
                  stroke={highlighted ? "rgba(45,74,94,0.5)" : "rgba(255,255,255,0.12)"}
                  strokeWidth={highlighted ? edgeWidth(corr) + 0.5 : edgeWidth(corr)}
                  strokeOpacity={highlighted ? 0.7 : edgeOpacity(corr)}
                />
              );
            })
          )}

          {/* Central orb */}
          <circle cx={cx} cy={cy} r={34} fill="rgba(45,74,94,0.08)" stroke="rgba(45,74,94,0.25)" strokeWidth={1.5} />
          <text x={cx} y={cy - 4} textAnchor="middle" fontFamily="Syne, sans-serif" fontWeight={800} fontSize={22}
            fill={scoreColor}>
            {displayScore ?? "—"}
          </text>
          <text x={cx} y={cy + 12} textAnchor="middle" fontFamily="DM Sans, sans-serif" fontSize={9}
            fill="rgba(231,236,239,0.3)" letterSpacing="1.5">
            TRUST
          </text>

          {/* Pillar nodes */}
          {nodes.map((node, i) => {
            const [nx, ny] = pts[i];
            const color    = PILLAR_COLORS[node.pillar];
            const r        = node.confidence != null ? 14 + node.confidence * 8 : 16;
            const isHov    = hovered === node.pillar;
            const animStyle = node.fired
              ? { animation: "node-pulse 2.5s ease-in-out infinite" }
              : {};

            const labelAngle = (2 * Math.PI * i) / 5 - Math.PI / 2;
            const lx = cx + (R + 28) * Math.cos(labelAngle);
            const ly = cy + (R + 28) * Math.sin(labelAngle);
            const anchor = lx < cx - 20 ? "end" : lx > cx + 20 ? "start" : "middle";

            return (
              <g
                key={node.pillar}
                style={{ cursor: "pointer", ...animStyle }}
                onMouseEnter={() => setHovered(node.pillar)}
                onMouseLeave={() => setHovered(null)}
              >
                {/* Glow ring for fired pillars */}
                {node.fired && (
                  <circle cx={nx} cy={ny} r={r + 6} fill="none"
                    stroke={color} strokeWidth={1} strokeOpacity={0.3} />
                )}
                {/* Node */}
                <circle
                  cx={nx} cy={ny} r={r}
                  fill={isHov ? `${color}40` : `${color}20`}
                  stroke={color}
                  strokeWidth={isHov ? 2.5 : 1.5}
                />
                {/* Verdict dot */}
                {node.fired && (
                  <circle cx={nx} cy={ny} r={4} fill={color} />
                )}
                {/* Label */}
                <text
                  x={lx} y={ly}
                  textAnchor={anchor}
                  fontFamily="DM Sans, sans-serif"
                  fontSize={10}
                  fill={isHov ? color : "rgba(231,236,239,0.45)"}
                  fontWeight={isHov ? 600 : 400}
                >
                  {PILLAR_LABELS[node.pillar]}
                </text>
                {/* Score text inside node */}
                <text x={nx} y={ny + 4} textAnchor="middle"
                  fontFamily="JetBrains Mono, monospace" fontSize={9}
                  fill={color} fontWeight={600}>
                  {node.score != null ? node.score.toFixed(2) : "—"}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Hover side panel */}
        {hoveredNode && (
          <div
            style={{
              flex:         "1 1 180px",
              minWidth:     180,
              padding:      "18px 20px",
              background:   "rgba(255,255,255,0.025)",
              border:       `1px solid ${PILLAR_COLORS[hoveredNode.pillar]}40`,
              borderLeft:   `3px solid ${PILLAR_COLORS[hoveredNode.pillar]}`,
              borderRadius: "0 16px 16px 0",
              display:      "flex",
              flexDirection: "column",
              gap:          10,
              transition:   "all 0.2s ease",
            }}
          >
            <div style={{
              fontFamily: "Syne, sans-serif", fontWeight: 800,
              fontSize: 13, color: PILLAR_COLORS[hoveredNode.pillar],
            }}>
              {PILLAR_LABELS[hoveredNode.pillar]}
            </div>

            <StatRow label="Score"      value={hoveredNode.score != null ? hoveredNode.score.toFixed(3) : "—"} />
            <StatRow label="Confidence" value={hoveredNode.confidence != null ? hoveredNode.confidence.toFixed(3) : "—"} />
            <StatRow label="Verdict"    value={hoveredNode.fired ? "FIRED" : "CLEAN"}
              color={hoveredNode.fired ? "#be7468" : "#6fa98f"} />

            {hoveredNode.labeledN != null && hoveredNode.labeledN >= 30 ? (
              <>
                <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "4px 0" }} />
                <StatRow label="F1"        value={hoveredNode.f1 != null ? hoveredNode.f1.toFixed(3) : "—"} />
                <StatRow label="Precision" value={hoveredNode.precision != null ? hoveredNode.precision.toFixed(3) : "—"} />
                <StatRow label="Recall"    value={hoveredNode.recall != null ? hoveredNode.recall.toFixed(3) : "—"} />
                <StatRow label="FPR"       value={hoveredNode.fpr != null ? `${(hoveredNode.fpr * 100).toFixed(1)}%` : "—"} />
                <div style={{
                  fontFamily: "JetBrains Mono, monospace",
                  fontSize: 9, color: "rgba(231,236,239,0.25)", marginTop: 4,
                }}>
                  n = {hoveredNode.labeledN?.toLocaleString()}
                </div>
              </>
            ) : (
              <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ color: "rgba(45,74,94,0.45)", fontSize: 9 }}>◎</span>
                <span style={{
                  fontFamily: "JetBrains Mono, monospace", fontSize: 9,
                  color: "rgba(231,236,239,0.2)",
                }}>
                  {hoveredNode.labeledN != null
                    ? `Calibration: ${hoveredNode.labeledN}/30`
                    : "Awaiting labeled data"}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StatRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{
        fontFamily: "DM Sans, sans-serif", fontSize: 11,
        color: "rgba(231,236,239,0.35)", letterSpacing: "0.5px",
      }}>
        {label}
      </span>
      <span style={{
        fontFamily: "JetBrains Mono, monospace", fontSize: 11,
        color: color ?? "rgba(231,236,239,0.7)",
      }}>
        {value}
      </span>
    </div>
  );
}
