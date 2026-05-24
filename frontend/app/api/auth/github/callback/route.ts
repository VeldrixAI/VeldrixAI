import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { AUTH_API_URL, AUTH_COOKIE } from "@/lib/config";
import { getBaseUrl } from "@/lib/oauth";

export async function GET(request: NextRequest) {
  const base = getBaseUrl();

  try {
    const code = request.nextUrl.searchParams.get("code");
    const state = request.nextUrl.searchParams.get("state");

    if (!code) {
      return NextResponse.redirect(`${base}/login?error=no_code`);
    }

    const jar = await cookies();
    const storedState = jar.get("oauth_state")?.value;
    jar.delete("oauth_state");

    if (!state || !storedState || state !== storedState) {
      return NextResponse.redirect(`${base}/login?error=invalid_state`);
    }

    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return NextResponse.redirect(`${base}/login?error=oauth_not_configured`);
    }

    // Exchange code for access token
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
    });
    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      console.error("GitHub token exchange failed:", tokenData);
      return NextResponse.redirect(`${base}/login?error=token_failed`);
    }

    // Fetch user profile from GitHub
    const profileRes = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: "application/vnd.github+json",
      },
    });
    const profile = await profileRes.json();

    // GitHub may not expose email publicly — fetch from the emails endpoint
    let email: string | null = profile.email ?? null;
    if (!email) {
      const emailsRes = await fetch("https://api.github.com/user/emails", {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          Accept: "application/vnd.github+json",
        },
      });
      const emails: Array<{ email: string; primary: boolean; verified: boolean }> = await emailsRes.json();
      email =
        emails.find((e) => e.primary && e.verified)?.email ??
        emails.find((e) => e.verified)?.email ??
        null;
    }

    if (!email) {
      return NextResponse.redirect(`${base}/login?error=no_email`);
    }

    // Hand off to backend auth service — it owns user creation and JWT signing
    const authRes = await fetch(`${AUTH_API_URL}/auth/oauth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "github",
        oauth_id: String(profile.id),
        email,
        display_name: profile.name ?? profile.login ?? null,
        avatar_url: profile.avatar_url ?? null,
      }),
    });

    if (!authRes.ok) {
      const err = await authRes.json().catch(() => ({}));
      console.error("Backend OAuth failed:", err);
      return NextResponse.redirect(`${base}/login?error=oauth_failed`);
    }

    const { access_token } = await authRes.json();

    jar.set(AUTH_COOKIE, access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    return NextResponse.redirect(`${base}/dashboard`);
  } catch (error) {
    console.error("GitHub OAuth error:", error);
    return NextResponse.redirect(`${getBaseUrl()}/login?error=oauth_failed`);
  }
}
