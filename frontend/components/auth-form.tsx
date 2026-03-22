"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type Mode = "login" | "signup";

const oauthErrors: Record<string, string> = {
  no_code: "Authentication was cancelled",
  oauth_not_configured: "OAuth is not configured yet",
  token_failed: "Failed to verify your account",
  no_email: "Could not retrieve your email address",
  email_not_verified: "Your email address is not verified with Google",
  account_deactivated: "This account has been deactivated",
  invalid_state: "Session expired, please try again",
  oauth_failed: "Authentication failed, please try again",
};

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor">
      <path d="M9 0C4.027 0 0 4.027 0 9c0 3.977 2.579 7.35 6.154 8.543.45.083.615-.195.615-.433 0-.214-.008-.78-.012-1.531-2.503.544-3.032-1.206-3.032-1.206-.41-1.04-1-1.317-1-1.317-.816-.558.062-.547.062-.547.903.063 1.378.927 1.378.927.803 1.376 2.107.978 2.62.748.081-.582.314-.978.571-1.203-1.999-.227-4.1-1-4.1-4.449 0-.983.351-1.786.927-2.415-.093-.228-.402-1.143.088-2.382 0 0 .756-.242 2.475.922A8.633 8.633 0 0 1 9 4.363c.765.004 1.534.103 2.253.303 1.718-1.164 2.473-.922 2.473-.922.491 1.24.182 2.154.089 2.382.577.629.926 1.432.926 2.415 0 3.458-2.104 4.219-4.108 4.441.323.278.61.827.61 1.666 0 1.203-.011 2.174-.011 2.47 0 .24.163.52.619.432C15.424 16.347 18 12.974 18 9c0-4.973-4.027-9-9-9z"/>
    </svg>
  );
}

export function AuthForm({ mode }: { mode: Mode }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const searchParams = useSearchParams();

  const isSignup = mode === "signup";

  useEffect(() => {
    const errParam = searchParams.get("error");
    if (errParam) {
      setError(oauthErrors[errParam] || "Authentication failed");
    }
  }, [searchParams]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const endpoint = isSignup ? "/api/auth/signup" : "/api/auth/login";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || payload.detail || "Authentication failed");
      }
      window.location.href = "/dashboard";
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Something went wrong"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="auth-card" onSubmit={onSubmit}>
      <h1>{isSignup ? "Create Your Account" : "Welcome Back"}</h1>
      <p className="muted">
        {isSignup 
          ? "Start securing your AI outputs with enterprise-grade trust orchestration." 
          : "Sign in to access your AegisAI dashboard and manage your AI governance."}
      </p>

      <label>
        <span>Work Email</span>
        <input
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@company.com"
        />
      </label>
      <label>
        <span>Password</span>
        <input
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Minimum 6 characters"
        />
      </label>
      {error ? <p className="error">{error}</p> : null}
      <button className="solid-btn" type="submit" disabled={loading} style={{ marginTop: '0.5rem' }}>
        {loading ? "Processing..." : isSignup ? "Create Account" : "Sign In"}
      </button>
      <p className="switch">
        {isSignup ? "Already have an account?" : "Don't have an account?"}{" "}
        <Link href={isSignup ? "/login" : "/signup"}>
          {isSignup ? "Sign in" : "Sign up for free"}
        </Link>
      </p>
    </form>
  );
}
