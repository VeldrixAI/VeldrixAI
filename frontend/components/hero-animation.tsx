"use client";

export function HeroAnimation() {
  return (
    <div className="hero-anim">
      <div className="hero-anim-glow" />
      <div className="hero-anim-glow hero-anim-glow-2" />

      <svg className="hero-anim-svg" viewBox="0 0 500 500" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="ha-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#7c5cfc" />
            <stop offset="100%" stopColor="#9b7dff" />
          </linearGradient>
          <linearGradient id="ha-grad2" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#7c5cfc" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#9b7dff" stopOpacity="0.1" />
          </linearGradient>
          <radialGradient id="ha-center-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#7c5cfc" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#7c5cfc" stopOpacity="0" />
          </radialGradient>
          <filter id="ha-blur">
            <feGaussianBlur stdDeviation="2" />
          </filter>
          <filter id="ha-glow">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <circle cx="250" cy="250" r="180" fill="url(#ha-center-glow)" />

        <circle className="ha-orbit-ring ha-orbit-ring-1" cx="250" cy="250" r="120" />
        <circle className="ha-orbit-ring ha-orbit-ring-2" cx="250" cy="250" r="170" />
        <circle className="ha-orbit-ring ha-orbit-ring-3" cx="250" cy="250" r="210" />

        <g className="ha-hex-group">
          <path
            className="ha-hex"
            d="M250 160L327.94 205V295L250 340L172.06 295V205L250 160Z"
          />
          <path
            className="ha-hex ha-hex-inner"
            d="M250 190L303.3 220.7V282.3L250 313L196.7 282.3V220.7L250 190Z"
          />
        </g>

        <g filter="url(#ha-glow)">
          <path className="ha-shield" d="M250 195L295 218V272L250 302L205 272V218L250 195Z" />
        </g>

        <g className="ha-center-icon">
          <circle cx="250" cy="248" r="18" fill="url(#ha-grad)" opacity="0.9" />
          <path d="M242 248L247 253L258 242" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </g>

        <g className="ha-conn-lines">
          <line className="ha-conn ha-conn-1" x1="250" y1="160" x2="250" y2="80" />
          <line className="ha-conn ha-conn-2" x1="327" y1="205" x2="400" y2="150" />
          <line className="ha-conn ha-conn-3" x1="327" y1="295" x2="410" y2="350" />
          <line className="ha-conn ha-conn-4" x1="250" y1="340" x2="250" y2="420" />
          <line className="ha-conn ha-conn-5" x1="172" y1="295" x2="100" y2="355" />
          <line className="ha-conn ha-conn-6" x1="172" y1="205" x2="95" y2="145" />
        </g>

        <g className="ha-nodes">
          <g className="ha-node ha-node-1">
            <circle cx="250" cy="72" r="14" className="ha-node-bg" />
            <circle cx="250" cy="72" r="5" fill="url(#ha-grad)" />
            <text x="250" y="52" className="ha-node-label">Safety</text>
          </g>
          <g className="ha-node ha-node-2">
            <circle cx="405" cy="145" r="14" className="ha-node-bg" />
            <circle cx="405" cy="145" r="5" fill="url(#ha-grad)" />
            <text x="405" y="125" className="ha-node-label">Accuracy</text>
          </g>
          <g className="ha-node ha-node-3">
            <circle cx="415" cy="355" r="14" className="ha-node-bg" />
            <circle cx="415" cy="355" r="5" fill="url(#ha-grad)" />
            <text x="415" y="380" className="ha-node-label">Fairness</text>
          </g>
          <g className="ha-node ha-node-4">
            <circle cx="250" cy="428" r="14" className="ha-node-bg" />
            <circle cx="250" cy="428" r="5" fill="url(#ha-grad)" />
            <text x="250" y="455" className="ha-node-label">Security</text>
          </g>
          <g className="ha-node ha-node-5">
            <circle cx="95" cy="358" r="14" className="ha-node-bg" />
            <circle cx="95" cy="358" r="5" fill="url(#ha-grad)" />
            <text x="95" y="383" className="ha-node-label">Compliance</text>
          </g>
          <g className="ha-node ha-node-6">
            <circle cx="90" cy="140" r="14" className="ha-node-bg" />
            <circle cx="90" cy="140" r="5" fill="url(#ha-grad)" />
            <text x="90" y="120" className="ha-node-label">Privacy</text>
          </g>
        </g>

        <g className="ha-orbit-dots">
          <circle className="ha-orb ha-orb-1" r="4" fill="url(#ha-grad)" filter="url(#ha-glow)">
            <animateMotion dur="8s" repeatCount="indefinite">
              <mpath href="#ha-orbit-path-1" />
            </animateMotion>
          </circle>
          <circle className="ha-orb ha-orb-2" r="3.5" fill="#9b7dff" filter="url(#ha-glow)">
            <animateMotion dur="12s" repeatCount="indefinite">
              <mpath href="#ha-orbit-path-2" />
            </animateMotion>
          </circle>
          <circle className="ha-orb ha-orb-3" r="3" fill="#7c5cfc" filter="url(#ha-glow)">
            <animateMotion dur="16s" repeatCount="indefinite">
              <mpath href="#ha-orbit-path-3" />
            </animateMotion>
          </circle>
        </g>

        <path id="ha-orbit-path-1" d="M370,250 A120,120 0 1,1 370,250.01" fill="none" />
        <path id="ha-orbit-path-2" d="M420,250 A170,170 0 1,1 420,250.01" fill="none" />
        <path id="ha-orbit-path-3" d="M460,250 A210,210 0 1,1 460,250.01" fill="none" />

        <g className="ha-particles">
          <circle className="ha-particle ha-p1" cx="150" cy="100" r="1.5" />
          <circle className="ha-particle ha-p2" cx="380" cy="90" r="1" />
          <circle className="ha-particle ha-p3" cx="420" cy="250" r="1.5" />
          <circle className="ha-particle ha-p4" cx="350" cy="420" r="1" />
          <circle className="ha-particle ha-p5" cx="130" cy="400" r="1.5" />
          <circle className="ha-particle ha-p6" cx="70" cy="250" r="1" />
          <circle className="ha-particle ha-p7" cx="200" cy="60" r="1" />
          <circle className="ha-particle ha-p8" cx="340" cy="60" r="1.5" />

          <circle className="ha-particle ha-p9" cx="440" cy="200" r="1" />
          <circle className="ha-particle ha-p10" cx="60" cy="310" r="1.5" />
          <circle className="ha-particle ha-p11" cx="310" cy="440" r="1" />
          <circle className="ha-particle ha-p12" cx="180" cy="440" r="1" />
        </g>

        <g className="ha-scan-line">
          <line x1="170" y1="250" x2="330" y2="250" stroke="url(#ha-grad)" strokeWidth="1" opacity="0.4" />
        </g>
      </svg>
    </div>
  );
}
