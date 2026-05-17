"use client";

import { useState, useEffect, useRef } from "react";
import { motion, useScroll, useSpring } from "framer-motion";

interface Packet {
  id: number;
  progress: number;
  pillar: number;
}

const PILLAR_NAMES = ['SAFETY', 'HALLUCINATION', 'BIAS', 'SECURITY', 'COMPLIANCE'];

export function Backbone() {
  const [packets, setPackets] = useState<Packet[]>([]);
  const [activePillar, setActivePillar] = useState(0);
  const packetIdRef = useRef(0);

  const { scrollYProgress } = useScroll();
  const smoothProgress = useSpring(scrollYProgress, { stiffness: 100, damping: 30 });

  useEffect(() => {
    return smoothProgress.on("change", (latest) => {
      const pillarIndex = Math.floor(latest * 5);
      if (pillarIndex !== activePillar && pillarIndex < 5) {
        setActivePillar(pillarIndex);
        setPackets((prev) => [
          ...prev.slice(-3),
          { id: ++packetIdRef.current, progress: latest, pillar: pillarIndex }
        ]);
      }
    });
  }, [smoothProgress, activePillar]);

  return (
    <div className="vdx-backbone-container">
      <div className="vdx-backbone-line">
        <motion.div className="vdx-backbone-fill" style={{ scaleY: smoothProgress }} />
      </div>
      {PILLAR_NAMES.map((name, i) => (
        <motion.div
          key={name}
          className={`vdx-backbone-node ${activePillar === i ? 'active' : ''}`}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: activePillar >= i ? 1 : 0.2, x: 0 }}
          transition={{ stiffness: 300, damping: 30 }}
        >
          <div className="vdx-node-marker" />
          <span className="vdx-node-label">{name}</span>
        </motion.div>
      ))}
      {packets.map((packet) => (
        <motion.div
          key={packet.id}
          className="vdx-packet"
          initial={{ top: "0%" }}
          animate={{ top: `${packet.progress * 100}%` }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        />
      ))}
    </div>
  );
}
