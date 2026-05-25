import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getGitHubAuthUrl, generateOAuthState, getBaseUrl } from "@/lib/oauth";

export async function GET() {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return NextResponse.redirect(`${getBaseUrl()}/login?error=oauth_not_configured`);
  }

  const state = generateOAuthState();
  const url = getGitHubAuthUrl(state);
  if (!url) {
    return NextResponse.redirect(`${getBaseUrl()}/login?error=oauth_not_configured`);
  }

  const jar = await cookies();
  jar.set("oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  return NextResponse.redirect(url);
}
