"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

function SuccessInner() {
  const searchParams = useSearchParams();
  const tx = searchParams.get("tx") || "—";
  const plan = (searchParams.get("plan") || "grow").toUpperCase();
  const amountCents = parseInt(searchParams.get("amount") || "0", 10);
  const amountFmt = amountCents > 0 ? `$${(amountCents / 100).toFixed(2)}` : "—";

  const rows = [
    { label: "Transaction ID", value: tx },
    { label: "Plan",           value: `${plan.charAt(0) + plan.slice(1).toLowerCase()} Plan` },
    { label: "Amount",         value: `${amountFmt} USD` },
    { label: "Billing Cycle",  value: "Monthly Subscription" },
    { label: "Status",         value: "SUCCEEDED", green: true },
  ];

  return (
    <div style={{
      minHeight: "100vh",
      background: "var(--vx-page-bg)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "40px 20px",
    }}>
      <div style={{ width: "100%", maxWidth: "520px" }}>

        <div style={{
          background: "var(--vx-card-bg)",
          border: "1px solid rgba(111,169,143,0.25)",
          borderRadius: "24px",
          padding: "48px 40px",
          position: "relative",
          overflow: "hidden",
          textAlign: "center",
          boxShadow: "0 16px 60px rgba(111,169,143,0.10)",
        }}>
          {/* Top accent */}
          <div style={{
            position: "absolute", top: 0, left: 0, right: 0, height: "1px",
            background: "linear-gradient(90deg, transparent, rgba(111,169,143,0.7), rgba(170,184,192,0.5), transparent)",
          }} />

          {/* Animated check mark */}
          <div style={{
            width: "72px",
            height: "72px",
            borderRadius: "50%",
            background: "rgba(111,169,143,0.12)",
            border: "1px solid rgba(111,169,143,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 24px",
            fontSize: "36px",
          }}>
            ✓
          </div>

          <div style={{
            fontFamily: "var(--vx-font-body)",
            fontWeight: 600,
            fontSize: "9px",
            letterSpacing: "3px",
            textTransform: "uppercase",
            color: "rgba(111,169,143,0.7)",
            marginBottom: "10px",
          }}>
            Transaction Verified
          </div>

          <h1 style={{
            fontFamily: "var(--vx-font-display)",
            fontWeight: 800,
            fontSize: "28px",
            letterSpacing: "-0.8px",
            color: "var(--vx-text-primary)",
            marginBottom: "8px",
          }}>
            Payment Confirmed
          </h1>

          <p style={{
            fontFamily: "var(--vx-font-body)",
            fontWeight: 300,
            fontSize: "13px",
            color: "var(--vx-text-muted)",
            lineHeight: 1.6,
            marginBottom: "8px",
          }}>
            Your subscription is now active. A PDF receipt has been sent to your email.
          </p>

          <div style={{
            fontFamily: "var(--vx-font-display)",
            fontWeight: 800,
            fontSize: "40px",
            letterSpacing: "-1.5px",
            color: "var(--vx-success)",
            margin: "20px 0 4px",
          }}>
            {amountFmt}
          </div>

          {/* Receipt table */}
          <div style={{
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: "14px",
            overflow: "hidden",
            margin: "24px 0",
            textAlign: "left",
          }}>
            {rows.map(({ label, value, green }, i) => (
              <div key={label} style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "12px 20px",
                borderBottom: i < rows.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none",
              }}>
                <span style={{
                  fontFamily: "var(--vx-font-body)",
                  fontSize: "11px",
                  color: "var(--vx-text-dim)",
                  letterSpacing: "1px",
                }}>
                  {label}
                </span>
                <span style={{
                  fontFamily: label === "Transaction ID" ? "'JetBrains Mono', monospace" : "var(--vx-font-body)",
                  fontSize: "12px",
                  fontWeight: 600,
                  color: green ? "var(--vx-success)" : "var(--vx-text-primary)",
                }}>
                  {value}
                </span>
              </div>
            ))}
          </div>

          {/* CTA buttons */}
          <div style={{ display: "flex", gap: "10px", flexDirection: "column" }}>
            <Link href="/dashboard" style={{
              display: "block",
              padding: "14px 24px",
              borderRadius: "12px",
              background: "linear-gradient(135deg, #2d4a5e, #243b4c)",
              color: "#fff",
              fontFamily: "var(--vx-font-display)",
              fontWeight: 700,
              fontSize: "12px",
              letterSpacing: "1px",
              textTransform: "uppercase",
              textDecoration: "none",
              textAlign: "center",
              boxShadow: "0 8px 24px rgba(45,74,94,0.35)",
            }}>
              → Go to Dashboard
            </Link>
            <Link href="/dashboard/billing" style={{
              display: "block",
              padding: "12px 24px",
              borderRadius: "12px",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.10)",
              color: "var(--vx-text-muted)",
              fontFamily: "var(--vx-font-body)",
              fontWeight: 500,
              fontSize: "12px",
              letterSpacing: "1px",
              textTransform: "uppercase",
              textDecoration: "none",
              textAlign: "center",
            }}>
              View Billing
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SuccessPage() {
  return (
    <Suspense fallback={
      <div style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--vx-page-bg)",
      }} />
    }>
      <SuccessInner />
    </Suspense>
  );
}
