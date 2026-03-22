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

    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return NextResponse.redirect(`${getBaseUrl()}/login?error=oauth_not_configured`);
    }

    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      console.error("GitHub token error:", tokenData);
      return NextResponse.redirect(`${getBaseUrl()}/login?error=token_failed`);
    }

    const userRes = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: "application/vnd.github+json",
      },
    });
    const profile = await userRes.json();

    let email = profile.email;
    if (!email) {
      const emailsRes = await fetch("https://api.github.com/user/emails", {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          Accept: "application/vnd.github+json",
        },
      });
      const emails = await emailsRes.json();
      const primary = emails.find((e: { primary: boolean; verified: boolean }) => e.primary && e.verified);
      email = primary?.email || emails.find((e: { verified: boolean }) => e.verified)?.email;
    }

    if (!email) {
      return NextResponse.redirect(`${getBaseUrl()}/login?error=no_email`);
    }

    await initDB();

    let user = (await pool.query("SELECT id, email, role, is_active FROM users WHERE email = $1", [email])).rows[0];

    if (user) {
      if (!user.is_active) {
        return NextResponse.redirect(`${getBaseUrl()}/login?error=account_deactivated`);
      }
      await pool.query(
        "UPDATE users SET oauth_provider = 'github', oauth_id = $1, display_name = $2, avatar_url = $3 WHERE id = $4",
        [String(profile.id), profile.name || profile.login, profile.avatar_url, user.id]
      );
    } else {
      const result = await pool.query(
        "INSERT INTO users (email, oauth_provider, oauth_id, display_name, avatar_url) VALUES ($1, 'github', $2, $3, $4) RETURNING id, email, role, is_active",
        [email, String(profile.id), profile.name || profile.login, profile.avatar_url]
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
    console.error("GitHub OAuth error:", error);
    return NextResponse.redirect(`${getBaseUrl()}/login?error=oauth_failed`);
  }
}
