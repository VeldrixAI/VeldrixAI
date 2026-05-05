"use client";
import { useState } from "react";
import { motion } from "framer-motion";
import { Check, Copy } from "lucide-react";
import FadeUp from "@/components/animations/FadeUp";

const INSTALL_CMD = "pip install veldrixai";

export default function FinalCTA() {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(INSTALL_CMD);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="py-32 px-6" id="get-started">
      <div className="max-w-7xl mx-auto flex flex-col items-center text-center">
        <FadeUp>
          <p className="font-body text-[10px] tracking-[4px] uppercase text-snow/30 mb-5">
            Get Started
          </p>
          <h2
            className="font-display font-bold text-white tracking-[-2px] mb-5 max-w-lg"
            style={{ fontSize: "clamp(36px, 5vw, 64px)", lineHeight: 1.05 }}
          >
            Start governing your AI in the next 15 minutes.
          </h2>
          <p className="font-body font-light text-[17px] text-snow/50 max-w-md mb-10 leading-relaxed">
            One decorator. Five trust pillars. Full audit trail. No infrastructure changes required.
          </p>
        </FadeUp>

        {/* Install command */}
        <FadeUp delay={0.1}>
          <div
            className="flex items-center gap-3 px-5 py-3.5 rounded-xl mb-10 cursor-pointer group"
            style={{
              background: "#0d1120",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
            onClick={handleCopy}
          >
            <span className="font-mono text-[14px] text-snow/70 select-all">{INSTALL_CMD}</span>
            <button
              className="ml-2 text-snow/30 group-hover:text-snow/70 transition-colors duration-200"
              aria-label="Copy install command"
            >
              {copied ? (
                <Check size={14} className="text-emerald" />
              ) : (
                <Copy size={14} />
              )}
            </button>
          </div>
        </FadeUp>

        {/* CTA buttons */}
        <FadeUp delay={0.2}>
          <div className="flex items-center gap-4 flex-wrap justify-center">
            <motion.a
              href="#"
              whileTap={{ scale: 0.97 }}
              className="font-display font-semibold text-[15px] bg-violet text-white px-8 py-3.5 rounded-lg hover:bg-indigo transition-colors duration-200"
            >
              Get Your Free API Key
            </motion.a>
            <motion.a
              href="#"
              whileTap={{ scale: 0.97 }}
              className="group font-body text-[15px] text-snow/60 hover:text-snow/100 transition-colors duration-200 flex items-center gap-1.5 px-2 py-3.5"
            >
              Read the Docs
              <span className="inline-block transition-transform duration-200 group-hover:translate-x-0.5">→</span>
            </motion.a>
          </div>
        </FadeUp>
      </div>
    </section>
  );
}
