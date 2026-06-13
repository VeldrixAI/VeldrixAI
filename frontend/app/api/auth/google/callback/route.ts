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

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return NextResponse.redirect(`${base}/login?error=oauth_not_configured`);
    }

    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${base}/api/auth/google/callback`,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      console.error("Google token exchange failed:", tokenData);
      return NextResponse.redirect(`${base}/login?error=token_failed`);
    }

    // Fetch user profile from Google
    const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const profile = await profileRes.json();

    if (!profile.email) {
      return NextResponse.redirect(`${base}/login?error=no_email`);
    }
    if (profile.verified_email === false) {
      return NextResponse.redirect(`${base}/login?error=email_not_verified`);
    }

    // Hand off to backend auth service — it owns user creation and JWT signing
    const authRes = await fetch(`${AUTH_API_URL}/auth/oauth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "google",
        oauth_id: profile.id,
        email: profile.email,
        display_name: profile.name ?? null,
        avatar_url: profile.picture ?? null,
      }),
    });

    if (!authRes.ok) {
      const err = await authRes.json().catch(() => ({}));
      console.error("Backend OAuth failed:", err);
      return NextResponse.redirect(`${base}/login?error=oauth_failed`);
    }

    const { access_token } = await authRes.json();

    // Set the session cookie ON the redirect response so Set-Cookie ships with
    // the 302. Setting it via the cookies() jar while returning a separate
    // NextResponse.redirect() drops the header — the browser then lands on
    // /dashboard with no cookie and bounces to /login ("first attempt fails,
    // second succeeds").
    const response = NextResponse.redirect(`${base}/dashboard`);
    response.cookies.set(AUTH_COOKIE, access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    return response;
  } catch (error) {
    console.error("Google OAuth error:", error);
    return NextResponse.redirect(`${getBaseUrl()}/login?error=oauth_failed`);
  }
}
