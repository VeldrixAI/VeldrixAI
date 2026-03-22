"use client";

// ── Brand Wordmark SVGs ───────────────────────────────────────────────────────
// Each is a self-contained SVG wordmark matching the provider's authentic brand.

function GoogleWordmark() {
  // Classic Google multi-color wordmark
  return (
    <svg height="30" viewBox="0 0 90 30" fill="none" aria-label="Google">
      <text
        fontFamily="'Arial', 'Helvetica Neue', sans-serif"
        fontSize="26"
        fontWeight="700"
        y="25"
      >
        <tspan fill="#4285F4">G</tspan>
        <tspan fill="#EA4335">o</tspan>
        <tspan fill="#FBBC05">o</tspan>
        <tspan fill="#4285F4">g</tspan>
        <tspan fill="#34A853">l</tspan>
        <tspan fill="#EA4335">e</tspan>
      </text>
    </svg>
  );
}

function VectaraWordmark() {
  // Vectara — teal V-mark + wordmark text
  return (
    <svg height="30" viewBox="0 0 110 30" fill="none" aria-label="Vectara">
      {/* V mark icon */}
      <path d="M2 4l7 18 7-18" stroke="#00c8aa" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="9" cy="22" r="2" fill="#00c8aa" />
      {/* wordmark */}
      <text x="22" y="23" fontFamily="'Arial', sans-serif" fontSize="17" fontWeight="700" fill="#00c8aa" letterSpacing="-0.3">
        vectara
      </text>
    </svg>
  );
}

function HuggingFaceWordmark() {
  // HuggingFace — iconic yellow emoji face + wordmark
  return (
    <svg height="30" viewBox="0 0 148 30" fill="none" aria-label="Hugging Face">
      {/* face circle */}
      <circle cx="14" cy="15" r="13" fill="#FFD21E" />
      {/* eyes */}
      <ellipse cx="10" cy="13.5" rx="1.6" ry="2" fill="#3d2a00" />
      <ellipse cx="18" cy="13.5" rx="1.6" ry="2" fill="#3d2a00" />
      {/* smile */}
      <path d="M9 19c1.2 2 8.8 2 10 0" stroke="#3d2a00" strokeWidth="1.4" strokeLinecap="round" />
      {/* hugging arms */}
      <path d="M3 18.5c-1.6-3.5.8-7.5 3-5.5" stroke="#e6bc00" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M25 18.5c1.6-3.5-.8-7.5-3-5.5" stroke="#e6bc00" strokeWidth="2.2" strokeLinecap="round" />
      {/* wordmark */}
      <text x="32" y="22" fontFamily="'Arial', sans-serif" fontSize="15" fontWeight="700" fill="#FFD21E" letterSpacing="-0.2">
        Hugging Face
      </text>
    </svg>
  );
}

function ProtectAIWordmark() {
  // ProtectAI — shield icon + wordmark
  return (
    <svg height="30" viewBox="0 0 118 30" fill="none" aria-label="ProtectAI">
      {/* shield */}
      <path d="M13 1L3 5.5v7c0 6.2 4.8 12 10 13.5 5.2-1.5 10-7.3 10-13.5v-7L13 1z"
        fill="rgba(99,102,241,0.18)" stroke="#6366f1" strokeWidth="1.4" />
      {/* lock body */}
      <rect x="9.5" y="13" width="7" height="5.5" rx="1" fill="#6366f1" />
      {/* lock shackle */}
      <path d="M11 13v-2a2 2 0 014 0v2" stroke="#6366f1" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      {/* dot */}
      <circle cx="13" cy="15.8" r="1" fill="white" opacity="0.85" />
      {/* wordmark */}
      <text x="30" y="22" fontFamily="'Arial', sans-serif" fontSize="16" fontWeight="700" fill="#818cf8" letterSpacing="-0.3">
        Protect<tspan fill="#c7d2fe">AI</tspan>
      </text>
    </svg>
  );
}

function MicrosoftWordmark() {
  // Microsoft — 4-square Windows logo + wordmark
  return (
    <svg height="30" viewBox="0 0 136 30" fill="none" aria-label="Microsoft">
      {/* four squares */}
      <rect x="0"  y="0"  width="11" height="11" fill="#F25022" />
      <rect x="13" y="0"  width="11" height="11" fill="#7FBA00" />
      <rect x="0"  y="13" width="11" height="11" fill="#00A4EF" />
      <rect x="13" y="13" width="11" height="11" fill="#FFB900" />
      {/* wordmark */}
      <text x="30" y="21" fontFamily="'Segoe UI', 'Arial', sans-serif" fontSize="16" fontWeight="600" fill="#ffffff" letterSpacing="-0.2" opacity="0.9">
        Microsoft
      </text>
    </svg>
  );
}

// ── Providers list ────────────────────────────────────────────────────────────

const providers = [
  { name: "Google",       logo: <GoogleWordmark /> },
  { name: "Vectara",      logo: <VectaraWordmark /> },
  { name: "Hugging Face", logo: <HuggingFaceWordmark /> },
  { name: "ProtectAI",    logo: <ProtectAIWordmark /> },
  { name: "Microsoft",    logo: <MicrosoftWordmark /> },
];

// ── Carousel ──────────────────────────────────────────────────────────────────

export function ModelCarousel() {
  return (
    <div className="mc-carousel">
      <div className="mc-track">
        {providers.map((p, i) => (
          <div key={`a-${i}`} className="mc-logo-item" aria-label={p.name}>
            {p.logo}
          </div>
        ))}
        {providers.map((p, i) => (
          <div key={`b-${i}`} className="mc-logo-item" aria-hidden="true">
            {p.logo}
          </div>
        ))}
      </div>
    </div>
  );
}
