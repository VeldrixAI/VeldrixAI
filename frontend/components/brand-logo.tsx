import Link from "next/link";

export function BrandLogo({ href = "/" }: { href?: string }) {
  return (
    <Link className="brand" href={href} aria-label="VeldrixAI home">
      <svg className="brand-icon" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#7c5cfc" />
            <stop offset="100%" stopColor="#9b7dff" />
          </linearGradient>
        </defs>
        <path
          d="M20 2L37 12V28L20 38L3 28V12L20 2Z"
          stroke="url(#logoGradient)"
          strokeWidth="2"
          fill="none"
        />
        <path
          d="M20 10L30 16V24L20 30L10 24V16L20 10Z"
          fill="url(#logoGradient)"
          opacity="0.3"
        />
        <circle cx="20" cy="20" r="4" fill="url(#logoGradient)" />
        <path
          d="M20 16V12M20 28V24M16 20H12M28 20H24"
          stroke="url(#logoGradient)"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
      <span>VeldrixAI</span>
    </Link>
  );
}
