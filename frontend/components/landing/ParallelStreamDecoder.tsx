"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";

const RAW_STREAM = [
  { text: "Patient ", type: "text" },
  { text: "SSN", type: "pii" },
  { text: " is ", type: "text" },
  { text: "123-45-6789", type: "pii" },
  { text: ", prescribe ", type: "text" },
  { text: "80mg", type: "text" },
  { text: " of atorvastatin daily.", type: "text" },
];

const MASKED_MAP: Record<string, string> = {
  "SSN": "███",
  "123-45-6789": "███-██-████",
};

export function ParallelStreamDecoder() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isProcessing, setIsProcessing] = useState(true);

  useEffect(() => {
    if (!isProcessing) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => {
        if (prev >= RAW_STREAM.length - 1) {
          setIsProcessing(false);
          return prev;
        }
        return prev + 1;
      });
    }, 400);
    return () => clearInterval(interval);
  }, [isProcessing]);

  const resetStream = () => {
    setCurrentIndex(0);
    setIsProcessing(true);
  };

  return (
    <div className="vdx-parallel-decoder" onClick={resetStream}>
      <div className="vdx-decoder-header">
        <span className="vdx-mono-label">PARALLEL STREAM DECODER</span>
        <span className="vdx-mono-value">{isProcessing ? 'PROCESSING...' : 'COMPLETE'}</span>
      </div>
      <div className="vdx-stream-columns">
        <div className="vdx-stream-column">
          <div className="vdx-stream-label">RAW INPUT</div>
          <div className="vdx-stream-content">
            {RAW_STREAM.map((item, i) => (
              <motion.span
                key={`raw-${i}`}
                className={`vdx-stream-token ${item.type === 'pii' ? 'vdx-token-pii' : ''}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: i <= currentIndex ? 1 : 0.2 }}
                transition={{ stiffness: 300, damping: 30 }}
              >
                {item.text}
              </motion.span>
            ))}
          </div>
        </div>
        <div className="vdx-stream-arrow">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M5 12H19M19 12L12 5M19 12L12 19" stroke="rgba(45,74,94,0.4)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <div className="vdx-stream-column">
          <div className="vdx-stream-label">VELDRIX FILTERED</div>
          <div className="vdx-stream-content">
            {RAW_STREAM.map((item, i) => {
              const displayText = item.type === 'pii' ? MASKED_MAP[item.text] || item.text : item.text;
              return (
                <motion.span
                  key={`filtered-${i}`}
                  className={`vdx-stream-token ${item.type === 'pii' ? 'vdx-token-masked' : ''}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: i <= currentIndex ? 1 : 0.2 }}
                  transition={{ stiffness: 300, damping: 30 }}
                >
                  {displayText}
                </motion.span>
              );
            })}
          </div>
        </div>
      </div>
      <div className="vdx-decoder-footer">
        <div className="vdx-decoder-stat">
          <span className="vdx-micro-label">PII DETECTED</span>
          <span className="vdx-micro-value vdx-value-red">2</span>
        </div>
        <div className="vdx-decoder-stat">
          <span className="vdx-micro-label">MASKED</span>
          <span className="vdx-micro-value vdx-value-green">2</span>
        </div>
        <div className="vdx-decoder-stat">
          <span className="vdx-micro-label">LATENCY</span>
          <span className="vdx-micro-value">12ms</span>
        </div>
      </div>
    </div>
  );
}
