interface VeldrixMarkProps {
  size?: number;
  className?: string;
}

export default function VeldrixMark({ size = 28, className = "" }: VeldrixMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="VeldrixAI mark"
    >
      <rect width="32" height="32" rx="8" fill="#7C3AED" fillOpacity="0.15" />
      <rect width="32" height="32" rx="8" stroke="#7C3AED" strokeOpacity="0.4" strokeWidth="1" fill="none" />
      <path
        d="M8 9L16 23L24 9"
        stroke="#7C3AED"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 9L16 17L20 9"
        stroke="#06B6D4"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.8"
      />
    </svg>
  );
}
