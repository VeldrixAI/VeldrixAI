"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";

const TOKENS = [
  "The", "patient", "SSN", "is", "123-45-6789", ",", "prescribe",
  "80mg", "of", "atorvastatin", "daily", "."
];

// Pre-computed deterministic entropy values
const INITIAL_ENTROPY = [0.32, 0.45, 0.78, 0.28, 0.92, 0.15, 0.67, 0.41, 0.23, 0.56, 0.38, 0.19];

export function EntropyMap() {
  const [entropyValues, setEntropyValues] = useState<number[]>(INITIAL_ENTROPY);
  const [highlightedToken, setHighlightedToken] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const interval = setInterval(() => {
      setEntropyValues(TOKENS.map(() => Math.random()));
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const getColor = (entropy: number) => {
    if (entropy > 0.7) return "rgba(244,63,94,0.7)";
    if (entropy > 0.4) return "rgba(245,158,11,0.5)";
    return "rgba(16,185,129,0.3)";
  };

  const avgEntropy = entropyValues.length > 0 
    ? (entropyValues.reduce((a, b) => a + b, 0) / entropyValues.length).toFixed(3) 
    : '0.000';

  return (
    <div className="vdx-entropy-map">
      <div className="vdx-entropy-header">
        <span className="vdx-mono-label">TOKEN PROBABILITY DENSITY</span>
        <span className="vdx-mono-value">ENTROPY: {avgEntropy}</span>
      </div>
      <div className="vdx-entropy-grid">
        {TOKENS.map((token, i) => (
          <motion.div
            key={i}
            className="vdx-entropy-cell"
            style={{ backgroundColor: getColor(entropyValues[i] ?? 0.5) }}
            onMouseEnter={() => setHighlightedToken(i)}
            onMouseLeave={() => setHighlightedToken(null)}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: highlightedToken === i ? 1.1 : 1 }}
            transition={{ stiffness: 300, damping: 30 }}
          >
            <span className="vdx-entropy-token">{token}</span>
            <span className="vdx-entropy-score">{(entropyValues[i] ?? 0).toFixed(2)}</span>
          </motion.div>
        ))}
      </div>
      <div className="vdx-entropy-legend">
        <div className="vdx-legend-item"><div className="vdx-legend-dot" style={{ background: "rgba(16,185,129,0.5)" }} /><span>LOW</span></div>
        <div className="vdx-legend-item"><div className="vdx-legend-dot" style={{ background: "rgba(245,158,11,0.5)" }} /><span>MED</span></div>
        <div className="vdx-legend-item"><div className="vdx-legend-dot" style={{ background: "rgba(244,63,94,0.7)" }} /><span>HIGH</span></div>
      </div>
    </div>
  );
}
