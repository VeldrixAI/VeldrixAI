"use client";

import { useEffect } from "react";

export default function BillingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Billing page error]", error);
  }, [error]);

  return (
    <div
      style={{
        padding: "48px 32px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "16px",
        textAlign: "center",
      }}
    >
      <svg
        width="40"
        height="40"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#be7468"
        strokeWidth="1.5"
      >
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
      <h2
        style={{
          fontFamily: "var(--vx-font-display, 'Syne', sans-serif)",
          fontWeight: 700,
          fontSize: "20px",
          color: "#e7ecef",
        }}
      >
        Billing page failed to load
      </h2>
      <p
        style={{
          fontFamily: "var(--vx-font-body, 'DM Sans', sans-serif)",
          fontSize: "14px",
          color: "rgba(231,236,239,0.5)",
          maxWidth: "420px",
          lineHeight: 1.6,
        }}
      >
        {error?.message || "An unexpected error occurred."}
      </p>
      <button
        onClick={reset}
        style={{
          marginTop: "8px",
          padding: "10px 24px",
          borderRadius: "10px",
          background: "linear-gradient(135deg, #2d4a5e, #243b4c)",
          color: "#fff",
          fontFamily: "var(--vx-font-body, 'DM Sans', sans-serif)",
          fontWeight: 600,
          fontSize: "14px",
          border: "none",
          cursor: "pointer",
        }}
      >
        Try again
      </button>
    </div>
  );
}
