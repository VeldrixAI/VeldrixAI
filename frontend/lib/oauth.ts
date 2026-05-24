import crypto from "crypto";

export function getBaseUrl() {
  // Explicit override (set in production or .env.local)
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  }
  // Server-side: derive from NEXTAUTH_URL or fall back to localhost:3000
  if (typeof window === "undefined") {
    return process.env.NEXTAUTH_URL?.replace(/\/$/, "") ?? "http://localhost:5000";
  }
  // Client-side: use the current origin
  return window.location.origin;
}

export function generateOAuthState(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function getGoogleAuthUrl(state: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return null;

  const redirectUri = `${getBaseUrl()}/api/auth/google/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "consent",
    state,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export function getGitHubAuthUrl(state: string) {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) return null;

  const redirectUri = `${getBaseUrl()}/api/auth/github/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "user:email",
    state,
  });

  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}
