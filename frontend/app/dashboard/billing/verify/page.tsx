"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

// ── OTP digit input component ─────────────────────────────────────────────────

function OTPInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = value.split("").concat(Array(6).fill("")).slice(0, 6);

  const handleKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      const next = digits.map((d, idx) => (idx === i ? "" : d)).join("");
      onChange(next);
      if (i > 0) inputs.current[i - 1]?.focus();
    }
  };

  const handleChange = (i: number, raw: string) => {
    const ch = raw.replace(/\D/g, "").slice(-1);
    const next = digits.map((d, idx) => (idx === i ? ch : d)).join("").trim();
    onChange(next);
    if (ch && i < 5) inputs.current[i + 1]?.focus();
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    onChange(pasted);
    const focusIdx = Math.min(pasted.length, 5);
    inputs.current[focusIdx]?.focus();
    e.preventDefault();
  };

  return (
    <div style={{ display: "flex", gap: "10px", justifyContent: "center" }} onPaste={handlePaste}>
      {digits.map((digit, i) => (
        <input
          key={i}
          ref={(el) => { inputs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digit}
          disabled={disabled}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKey(i, e)}
          onFocus={(e) => e.target.select()}
          style={{
            width: "52px",
            height: "64px",
            borderRadius: "12px",
            border: digit
              ? "2px solid rgba(124,58,237,0.7)"
              : "1px solid rgba(255,255,255,0.12)",
            background: digit
              ? "rgba(124,58,237,0.08)"
              : "rgba(255,255,255,0.03)",
            color: "#fff",
            fontFamily: "'JetBrains Mono', 'Courier New', monospace",
            fontWeight: 700,
            fontSize: "24px",
            textAlign: "center",
            outline: "none",
            transition: "border-color 0.15s, background 0.15s, box-shadow 0.15s",
            boxShadow: digit ? "0 0 0 3px rgba(124,58,237,0.12)" : "none",
          }}
        />
      ))}
    </div>
  );
}

// ── Timer display ─────────────────────────────────────────────────────────────

function CountdownTimer({ seconds }: { seconds: number }) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const urgent = seconds <= 60;
  return (
    <span style={{
      fontFamily: "'JetBrains Mono', 'Courier New', monospace",
      fontSize: "13px",
      color: urgent ? "var(--vx-rose)" : "var(--vx-text-dim)",
      fontWeight: urgent ? 600 : 400,
    }}>
      {mins}:{String(secs).padStart(2, "0")}
    </span>
  );
}

// ── Inner verify page ─────────────────────────────────────────────────────────

function VerifyInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const piId = searchParams.get("pi_id") || "";
  const maskedEmail = searchParams.get("email") || "your email";
  const plan = searchParams.get("plan") || "grow";
  const cycle = searchParams.get("cycle") || "monthly";
  const pmId = searchParams.get("pm_id") || "";

  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(600);
  const [expired, setExpired] = useState(false);
  const [resending, setResending] = useState(false);

  // Countdown timer
  useEffect(() => {
    if (secondsLeft <= 0) { setExpired(true); return; }
    const t = setInterval(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [secondsLeft]);

  const handleVerify = async () => {
    if (otp.length !== 6 || loading || expired) return;
    setLoading(true);
    setError("");

    const res = await fetch("/api/billing/verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payment_intent_id: piId, otp }),
    });
    const data = await res.json();

    if (res.ok) {
      router.push(`/dashboard/billing/success?tx=${data.transaction_id}&plan=${data.plan}&amount=${data.amount}`);
      return;
    }

    if (res.status === 429 || res.status === 402) {
      router.push(`/dashboard/billing/failed?reason=${encodeURIComponent(data.error || "Payment failed")}&plan=${plan}&cycle=${cycle}`);
      return;
    }

    setError(data.error || "Verification failed. Please try again.");
    setLoading(false);
  };

  const handleResend = async () => {
    if (!pmId || resending) return;
    setResending(true);
    setError("");
    try {
      const res = await fetch("/api/billing/issue-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payment_intent_id: piId, payment_method_id: pmId }),
      });
      if (res.ok) {
        setSecondsLeft(600);
        setExpired(false);
        setOtp("");
      } else {
        const d = await res.json();
        setError(d.error || "Failed to resend code.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setResending(false);
    }
  };

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

        {/* Back link */}
        <Link href={`/dashboard/billing/checkout?plan=${plan}&cycle=${cycle}`} style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          fontFamily: "var(--vx-font-body)",
          fontWeight: 500,
          fontSize: "12px",
          letterSpacing: "1px",
          textTransform: "uppercase",
          color: "var(--vx-text-dim)",
          textDecoration: "none",
          marginBottom: "32px",
        }}>
          <span style={{ fontSize: "16px" }}>←</span>
          Back to Checkout
        </Link>

        <div style={{
          background: "var(--vx-card-bg)",
          border: "1px solid var(--vx-card-border)",
          borderRadius: "24px",
          padding: "40px 36px",
          position: "relative",
          overflow: "hidden",
          textAlign: "center",
        }}>
          {/* Top shimmer */}
          <div style={{
            position: "absolute", top: 0, left: 0, right: 0, height: "1px",
            background: "linear-gradient(90deg, transparent, rgba(124,58,237,0.7), rgba(6,182,212,0.5), transparent)",
          }} />

          {/* Lock icon */}
          <div style={{
            width: "60px",
            height: "60px",
            borderRadius: "50%",
            background: "rgba(124,58,237,0.12)",
            border: "1px solid rgba(124,58,237,0.25)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 20px",
            fontSize: "28px",
          }}>
            🔐
          </div>

          <h1 style={{
            fontFamily: "var(--vx-font-display)",
            fontWeight: 800,
            fontSize: "26px",
            letterSpacing: "-0.8px",
            color: "var(--vx-text-primary)",
            marginBottom: "8px",
          }}>
            Payment Authorization
          </h1>

          <p style={{
            fontFamily: "var(--vx-font-body)",
            fontWeight: 300,
            fontSize: "13px",
            color: "var(--vx-text-muted)",
            lineHeight: 1.6,
            marginBottom: "28px",
          }}>
            We sent a 6-digit verification code to{" "}
            <span style={{ color: "var(--vx-violet)", fontWeight: 500 }}>{maskedEmail}</span>
          </p>

          {/* OTP input */}
          <div style={{ marginBottom: "24px" }}>
            <OTPInput value={otp} onChange={setOtp} disabled={loading || expired} />
          </div>

          {/* Timer */}
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            marginBottom: "20px",
          }}>
            <span style={{
              fontFamily: "var(--vx-font-body)",
              fontSize: "12px",
              color: "var(--vx-text-dim)",
            }}>
              {expired ? "Code expired." : "Code expires in"}
            </span>
            {!expired && <CountdownTimer seconds={secondsLeft} />}
          </div>

          {/* Error */}
          {error && (
            <div style={{
              marginBottom: "16px",
              padding: "12px 16px",
              background: "rgba(244,63,94,0.08)",
              border: "1px solid rgba(244,63,94,0.25)",
              borderRadius: "10px",
              color: "var(--vx-rose)",
              fontFamily: "var(--vx-font-body)",
              fontSize: "13px",
              textAlign: "left",
            }}>
              {error}
            </div>
          )}

          {/* Expired warning */}
          {expired && (
            <div style={{
              marginBottom: "16px",
              padding: "12px 16px",
              background: "rgba(245,158,11,0.08)",
              border: "1px solid rgba(245,158,11,0.25)",
              borderRadius: "10px",
              color: "var(--vx-amber)",
              fontFamily: "var(--vx-font-body)",
              fontSize: "13px",
            }}>
              Your code has expired. Resend a new one below.
            </div>
          )}

          {/* Verify button */}
          <button
            onClick={handleVerify}
            disabled={otp.length !== 6 || loading || expired}
            style={{
              width: "100%",
              padding: "15px 24px",
              borderRadius: "12px",
              background: (otp.length !== 6 || loading || expired)
                ? "rgba(124,58,237,0.3)"
                : "linear-gradient(135deg, #7c3aed, #4f46e5)",
              border: "none",
              color: "#fff",
              fontFamily: "var(--vx-font-display)",
              fontWeight: 700,
              fontSize: "13px",
              letterSpacing: "1px",
              textTransform: "uppercase",
              cursor: (otp.length !== 6 || loading || expired) ? "not-allowed" : "pointer",
              boxShadow: "0 8px 28px rgba(124,58,237,0.3)",
              marginBottom: "12px",
            }}
          >
            {loading ? "Verifying…" : "Verify & Complete Payment"}
          </button>

          {/* Resend */}
          <button
            onClick={handleResend}
            disabled={resending || (!expired && secondsLeft > 540)}
            style={{
              background: "none",
              border: "none",
              color: resending || (!expired && secondsLeft > 540) ? "var(--vx-text-dim)" : "var(--vx-violet)",
              fontFamily: "var(--vx-font-body)",
              fontSize: "12px",
              cursor: resending || (!expired && secondsLeft > 540) ? "not-allowed" : "pointer",
              textDecoration: "underline",
              textUnderlineOffset: "2px",
              padding: 0,
            }}
          >
            {resending ? "Resending…" : "Resend code"}
          </button>

          {/* Security note */}
          <div style={{
            marginTop: "24px",
            paddingTop: "20px",
            borderTop: "1px solid rgba(255,255,255,0.06)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
          }}>
            <span style={{ fontSize: "12px" }}>🔒</span>
            <span style={{
              fontFamily: "var(--vx-font-body)",
              fontSize: "11px",
              color: "var(--vx-text-dim)",
            }}>
              Never share this code. VeldrixAI will never ask for it by phone or chat.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={
      <div style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--vx-page-bg)",
        fontFamily: "var(--vx-font-body)",
        color: "var(--vx-text-dim)",
      }}>
        Loading…
      </div>
    }>
      <VerifyInner />
    </Suspense>
  );
}
