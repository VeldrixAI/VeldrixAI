"use client";

import { useState } from "react";
import { motion } from "framer-motion";

interface Point {
  x: number;
  y: number;
  label: string;
  risk: "safe" | "warning" | "violation";
  size: number;
}

// Pre-computed deterministic sizes to avoid hydration mismatch
const POLICY_ZONES: Point[] = [
  { x: 30, y: 25, label: "benign", risk: "safe", size: 38 },
  { x: 50, y: 35, label: "medical", risk: "safe", size: 42 },
  { x: 70, y: 30, label: "finance", risk: "warning", size: 45 },
  { x: 25, y: 55, label: "harmful", risk: "violation", size: 40 },
  { x: 55, y: 60, label: "jailbreak", risk: "violation", size: 43 },
  { x: 80, y: 55, label: "injection", risk: "violation", size: 46 },
  { x: 40, y: 75, label: "hate", risk: "violation", size: 38 },
  { x: 65, y: 80, label: "violence", risk: "violation", size: 44 },
  { x: 15, y: 40, label: "neutral", risk: "safe", size: 41 },
  { x: 85, y: 70, label: "PII", risk: "warning", size: 39 },
];

export function VoronoiGuard() {
  const [hoveredPoint, setHoveredPoint] = useState<number | null>(null);

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case "violation": return "rgba(190,116,104,0.4)";
      case "warning": return "rgba(194,160,106,0.3)";
      default: return "rgba(111,169,143,0.2)";
    }
  };

  const getRiskStroke = (risk: string) => {
    switch (risk) {
      case "violation": return "rgba(190,116,104,0.8)";
      case "warning": return "rgba(194,160,106,0.6)";
      default: return "rgba(111,169,143,0.4)";
    }
  };

  return (
    <div className="vdx-voronoi-container">
      <div className="vdx-voronoi-header">
        <span className="vdx-mono-label">LATENT SPACE PROJECTION</span>
        <span className="vdx-mono-value">DIMENSIONS: 768D → 2D</span>
      </div>
      <svg width="100%" height="160" viewBox="0 0 100 100" className="vdx-voronoi-svg">
        <defs>
          <filter id="voronoiGlow">
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {[0, 25, 50, 75, 100].map((v) => (
          <g key={v}>
            <line x1={v} y1="0" x2={v} y2="100" stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" />
            <line x1="0" y1={v} x2="100" y2={v} stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" />
          </g>
        ))}
        {POLICY_ZONES.map((cell, i) => (
          <motion.g
            key={i}
            onMouseEnter={() => setHoveredPoint(i)}
            onMouseLeave={() => setHoveredPoint(null)}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: hoveredPoint === i ? 1.05 : 1 }}
            transition={{ stiffness: 300, damping: 30 }}
          >
            <rect
              x={cell.x - cell.size/2}
              y={cell.y - cell.size/2}
              width={cell.size}
              height={cell.size}
              fill={getRiskColor(cell.risk)}
              stroke={getRiskStroke(cell.risk)}
              strokeWidth="0.5"
              rx="2"
            />
            <circle cx={cell.x} cy={cell.y} r="2" fill={getRiskStroke(cell.risk)} filter="url(#voronoiGlow)" />
          </motion.g>
        ))}
        <motion.circle
          cx="45" cy="40" r="3" fill="#2d4a5e" filter="url(#voronoiGlow)"
          animate={{ cx: [45, 50, 45], cy: [40, 45, 40] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        />
      </svg>
      <div className="vdx-voronoi-footer">
        <span className="vdx-micro-label">PROMPT EMBEDDING</span>
        <span className="vdx-micro-value">NEAREST: benign (d=0.12)</span>
      </div>
    </div>
  );
}
