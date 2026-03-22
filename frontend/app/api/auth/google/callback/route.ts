import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import pool, { initDB } from "@/lib/db";
import { createToken } from "@/lib/auth";
import { AUTH_COOKIE } from "@/lib/config";
import { getBaseUrl } from "@/lib/oauth";

export async function GET(request: NextRequest) {
  try {
    const code = request.nextUrl.searchParams.get("code");
    const state = request.nextUrl.searchParams.get("state");

    if (!code) {
      return NextResponse.redirect(`${getBaseUrl()}/login?error=no_code`);
    }

    const jar = await cookies();
    const storedState = jar.get("oauth_state")?.value;
    jar.delete("oauth_state");

    if (!state || !storedState || state !== storedState) {
      return NextResponse.redirect(`${getBaseUrl()}/login?error=invalid_state`);
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return NextResponse.redirect(`${getBaseUrl()}/login?error=oauth_not_configured`);
    }

    const redirectUri = `${getBaseUrl()}/api/auth/google/callback`;

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      console.error("Google token error:", tokenData);
      return NextResponse.redirect(`${getBaseUrl()}/login?error=token_failed`);
    }

    const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    const profile = await userRes.json();
    if (!profile.email) {
      return NextResponse.redirect(`${getBaseUrl()}/login?error=no_email`);
    }

    if (profile.verified_email === false) {
      return NextResponse.redirect(`${getBaseUrl()}/login?error=email_not_verified`);
    }

    await initDB();

    let user = (await pool.query("SELECT id, email, role, is_active FROM users WHERE email = $1", [profile.email])).rows[0];

    if (user) {
      if (!user.is_active) {
        return NextResponse.redirect(`${getBaseUrl()}/login?error=account_deactivated`);
      }
      await pool.query(
        "UPDATE users SET oauth_provider = 'google', oauth_id = $1, display_name = $2, avatar_url = $3 WHERE id = $4",
        [profile.id, profile.name, profile.picture, user.id]
      );
    } else {
      const result = await pool.query(
        "INSERT INTO users (email, oauth_provider, oauth_id, display_name, avatar_url) VALUES ($1, 'google', $2, $3, $4) RETURNING id, email, role, is_active",
        [profile.email, profile.id, profile.name, profile.picture]
      );
      user = result.rows[0];
    }

    const token = await createToken(user.id, user.email, user.role);

    jar.set(AUTH_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    return NextResponse.redirect(`${getBaseUrl()}/dashboard`);
  } catch (error) {
    console.error("Google OAuth error:", error);
    return NextResponse.redirect(`${getBaseUrl()}/login?error=oauth_failed`);
  }
}
