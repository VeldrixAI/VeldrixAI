"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CodeToken {
  text: string;
  type: "keyword" | "string" | "comment" | "decorator" | "function" | "plain" | "param";
}

export interface CodeLine {
  tokens: CodeToken[];
}

interface CodeBlockProps {
  lines: CodeLine[];
  className?: string;
  copyText?: string;
  showCopy?: boolean;
}

const tokenColors: Record<CodeToken["type"], string> = {
  keyword:   "#7C3AED",
  string:    "#06B6D4",
  comment:   "rgba(240,242,255,0.3)",
  decorator: "#F59E0B",
  function:  "#F0F2FF",
  plain:     "rgba(240,242,255,0.7)",
  param:     "rgba(240,242,255,0.6)",
};

export default function CodeBlock({ lines, className = "", copyText, showCopy = false }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!copyText) return;
    navigator.clipboard.writeText(copyText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={cn(
        "relative rounded-[10px] border border-white/8 bg-[#080c18] overflow-hidden",
        className
      )}
    >
      {showCopy && (
        <button
          onClick={handleCopy}
          className="absolute top-3 right-3 p-1.5 rounded-md text-snow/30 hover:text-snow/70 transition-colors duration-200"
          aria-label="Copy code"
        >
          {copied ? (
            <Check size={14} className="text-emerald" />
          ) : (
            <Copy size={14} />
          )}
        </button>
      )}
      <pre className="font-mono text-[13px] leading-[1.7] p-5 overflow-x-auto">
        {lines.map((line, i) => (
          <div key={i}>
            {line.tokens.map((token, j) => (
              <span key={j} style={{ color: tokenColors[token.type] }}>
                {token.text}
              </span>
            ))}
          </div>
        ))}
      </pre>
    </div>
  );
}
