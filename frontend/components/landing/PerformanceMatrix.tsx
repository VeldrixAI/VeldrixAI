"use client";

import { useState } from "react";
import { motion } from "framer-motion";

interface Provider {
  name: string;
  baseLatency: number;
  veldrixOverhead: number;
}

const PROVIDERS: Provider[] = [
  { name: "Llama 3.1 8B", baseLatency: 180, veldrixOverhead: 142 },
  { name: "GPT-4o", baseLatency: 890, veldrixOverhead: 148 },
  { name: "Claude 3.5", baseLatency: 1200, veldrixOverhead: 151 },
  { name: "Gemini 1.5", baseLatency: 720, veldrixOverhead: 145 },
];

export function PerformanceMatrix() {
  const [hoveredProvider, setHoveredProvider] = useState<string | null>(null);
  const maxLatency = Math.max(...PROVIDERS.map((p) => p.baseLatency + p.veldrixOverhead));

  return (
    <div className="vdx-perf-matrix">
      <div className="vdx-perf-header">
        <span className="vdx-mono-label">HARDWARE-ACCELERATED PERFORMANCE</span>
        <span className="vdx-mono-value">NVIDIA NIM POWERED</span>
      </div>
      <div className="vdx-perf-chart">
        {PROVIDERS.map((provider, i) => {
          const baseWidth = (provider.baseLatency / maxLatency) * 100;
          const overheadWidth = (provider.veldrixOverhead / maxLatency) * 100;
          const isHovered = hoveredProvider === provider.name;

          return (
            <motion.div
              key={provider.name}
              className="vdx-perf-row"
              onMouseEnter={() => setHoveredProvider(provider.name)}
              onMouseLeave={() => setHoveredProvider(null)}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1, stiffness: 300, damping: 30 }}
            >
              <span className="vdx-perf-provider">{provider.name}</span>
              <div className="vdx-perf-bars">
                <motion.div
                  className="vdx-perf-base"
                  style={{ width: `${baseWidth}%` }}
                  animate={{ height: isHovered ? 28 : 20 }}
                  transition={{ stiffness: 300, damping: 30 }}
                >
                  <span className="vdx-perf-label">{provider.baseLatency}ms</span>
                </motion.div>
                <motion.div
                  className="vdx-perf-overhead"
                  style={{ width: `${overheadWidth}%` }}
                  animate={{ height: isHovered ? 28 : 20 }}
                  transition={{ stiffness: 300, damping: 30 }}
                >
                  <span className="vdx-perf-label vdx-label-overhead">+{provider.veldrixOverhead}ms</span>
                </motion.div>
              </div>
              <span className="vdx-perf-total">{provider.baseLatency + provider.veldrixOverhead}ms</span>
            </motion.div>
          );
        })}
      </div>
      <div className="vdx-perf-legend">
        <div className="vdx-perf-legend-item">
          <div className="vdx-perf-legend-box" style={{ background: "rgba(255,255,255,0.1)" }} />
          <span>Model Latency</span>
        </div>
        <div className="vdx-perf-legend-item">
          <div className="vdx-perf-legend-box" style={{ background: "#2d4a5e" }} />
          <span>Veldrix Overhead</span>
        </div>
      </div>
      <div className="vdx-perf-note">Sub-500ms Veldrix overhead across all major LLM providers</div>
    </div>
  );
}
