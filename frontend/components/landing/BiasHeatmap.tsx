"use client";

import { useState } from "react";
import { motion } from "framer-motion";

// Pre-computed deterministic values for hydration safety
const DEMOGRAPHIC_GROUPS = [
  { label: "Group A", score: 92, bias: 0.03 },
  { label: "Group B", score: 94, bias: 0.02 },
  { label: "Group C", score: 91, bias: 0.04 },
  { label: "Group D", score: 93, bias: 0.03 },
];

export function BiasHeatmap() {
  const [hoveredGroup, setHoveredGroup] = useState<number | null>(null);

  return (
    <div className="vdx-bias-container">
      <div className="vdx-bias-header">
        <span className="vdx-mono-label">FAIRNESS DISTRIBUTION MATRIX</span>
        <span className="vdx-mono-value">Δ MAX: 0.04</span>
      </div>

      <div className="vdx-bias-chart">
        {DEMOGRAPHIC_GROUPS.map((group, i) => (
          <motion.div
            key={group.label}
            className="vdx-bias-row"
            onMouseEnter={() => setHoveredGroup(i)}
            onMouseLeave={() => setHoveredGroup(null)}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.1, stiffness: 300, damping: 30 }}
          >
            <span className="vdx-bias-label">{group.label}</span>
            <div className="vdx-bias-bar-container">
              <motion.div
                className="vdx-bias-bar"
                initial={{ width: 0 }}
                animate={{ width: `${group.score}%` }}
                transition={{ delay: 0.2 + i * 0.1, duration: 0.8, ease: "easeOut" }}
                style={{
                  background: hoveredGroup === i 
                    ? "linear-gradient(90deg, rgba(45,74,94,0.6), rgba(170,184,192,0.4))"
                    : "linear-gradient(90deg, rgba(45,74,94,0.4), rgba(170,184,192,0.2))"
                }}
              />
            </div>
            <div className="vdx-bias-metrics">
              <span className="vdx-bias-score">{group.score}%</span>
              <span className="vdx-bias-delta">Δ{group.bias.toFixed(2)}</span>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="vdx-bias-footer">
        <div className="vdx-bias-stat">
          <span className="vdx-micro-label">VARIANCE</span>
          <span className="vdx-micro-value">0.012</span>
        </div>
        <div className="vdx-bias-stat">
          <span className="vdx-micro-label">THRESHOLD</span>
          <span className="vdx-micro-value">≤ 0.05</span>
        </div>
        <div className="vdx-bias-stat">
          <span className="vdx-micro-label">STATUS</span>
          <span className="vdx-micro-value vdx-value-green">PASS</span>
        </div>
      </div>
    </div>
  );
}
