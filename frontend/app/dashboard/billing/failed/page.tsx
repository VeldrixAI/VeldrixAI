"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

function FailedInner() {
  const searchParams = useSearchParams();
  const reason = searchParams.get("reason") || "Your payment could not be completed.";
  const plan = searchParams.get("plan") || "grow";
  const cycle = searchParams.get("cycle") || "monthly";

  return (
    <div style={{
      minHeight: "100vh",
      background: "var(--vx-page-bg)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "40px 20px",
    }}>
      <div style={{ width: "100%", maxWidth: "480px" }}>

        <div style={{
          background: "var(--vx-card-bg)",
          border: "1px solid rgba(190,116,104,0.25)",
          borderRadius: "24px",
          padding: "48px 40px",
          position: "relative",
          overflow: "hidden",
          textAlign: "center",
          boxShadow: "0 16px 60px rgba(190,116,104,0.08)",
        }}>
          {/* Top accent */}
          <div style={{
            position: "absolute", top: 0, left: 0, right: 0, height: "1px",
            background: "linear-gradient(90deg, transparent, rgba(190,116,104,0.7), rgba(194,160,106,0.4), transparent)",
          }} />

          {/* Error icon */}
          <div style={{
            width: "72px",
            height: "72px",
            borderRadius: "50%",
            background: "rgba(190,116,104,0.10)",
            border: "1px solid rgba(190,116,104,0.30)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 24px",
            fontSize: "36px",
          }}>
            ✕
          </div>

          <div style={{
            fontFamily: "var(--vx-font-body)",
            fontWeight: 600,
            fontSize: "9px",
            letterSpacing: "3px",
            textTransform: "uppercase",
            color: "rgba(190,116,104,0.7)",
            marginBottom: "10px",
          }}>
            Payment Failed
          </div>

          <h1 style={{
            fontFamily: "var(--vx-font-display)",
            fontWeight: 800,
            fontSize: "26px",
            letterSpacing: "-0.8px",
            color: "var(--vx-text-primary)",
            marginBottom: "12px",
          }}>
            Transaction Declined
          </h1>

          <div style={{
            background: "rgba(190,116,104,0.08)",
            border: "1px solid rgba(190,116,104,0.20)",
            borderRadius: "12px",
            padding: "16px 20px",
            marginBottom: "28px",
          }}>
            <p style={{
              fontFamily: "var(--vx-font-body)",
              fontWeight: 400,
              fontSize: "13px",
              color: "rgba(190,116,104,0.85)",
              lineHeight: 1.6,
              margin: 0,
            }}>
              {reason}
            </p>
          </div>

          <p style={{
            fontFamily: "var(--vx-font-body)",
            fontWeight: 300,
            fontSize: "13px",
            color: "var(--vx-text-muted)",
            lineHeight: 1.6,
            marginBottom: "28px",
          }}>
            No charges have been made to your card. You can safely try again with a different payment method.
          </p>

          {/* Suggestions */}
          <div style={{
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: "12px",
            padding: "16px 20px",
            marginBottom: "28px",
            textAlign: "left",
          }}>
            <div style={{
              fontFamily: "var(--vx-font-body)",
              fontWeight: 600,
              fontSize: "9px",
              letterSpacing: "2px",
              textTransform: "uppercase",
              color: "var(--vx-text-dim)",
              marginBottom: "10px",
            }}>
              Common Reasons
            </div>
            {[
              "Insufficient funds on card",
              "Card blocked for online transactions",
              "Incorrect card details entered",
              "OTP expired or max attempts exceeded",
            ].map((r) => (
              <div key={r} style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "5px 0",
              }}>
                <span style={{ color: "var(--vx-error)", fontSize: "12px" }}>•</span>
                <span style={{
                  fontFamily: "var(--vx-font-body)",
                  fontSize: "12px",
                  color: "var(--vx-text-muted)",
                }}>
                  {r}
                </span>
              </div>
            ))}
          </div>

          {/* CTA buttons */}
          <div style={{ display: "flex", gap: "10px", flexDirection: "column" }}>
            <Link href={`/dashboard/billing/checkout?plan=${plan}&cycle=${cycle}`} style={{
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
              boxShadow: "0 8px 24px rgba(45,74,94,0.30)",
            }}>
              Try Again →
            </Link>
            <Link href="/dashboard/billing" style={{
              display: "block",
              padding: "12px 24px",
              borderRadius: "12px",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.09)",
              color: "var(--vx-text-muted)",
              fontFamily: "var(--vx-font-body)",
              fontWeight: 500,
              fontSize: "12px",
              letterSpacing: "1px",
              textTransform: "uppercase",
              textDecoration: "none",
              textAlign: "center",
            }}>
              Back to Billing
            </Link>
          </div>

          {/* Support note */}
          <p style={{
            fontFamily: "var(--vx-font-body)",
            fontSize: "11px",
            color: "var(--vx-text-dim)",
            marginTop: "20px",
            lineHeight: 1.6,
          }}>
            Need help?{" "}
            <a href="mailto:support@veldrixai.ca" style={{ color: "var(--vx-slate)", textDecoration: "underline", textUnderlineOffset: "2px" }}>
              support@veldrixai.ca
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function FailedPage() {
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
      <FailedInner />
    </Suspense>
  );
}
