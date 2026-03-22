import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getGoogleAuthUrl, getGitHubAuthUrl, generateOAuthState } from "@/lib/oauth";

export async function GET() {
  const state = generateOAuthState();

  const jar = await cookies();
  jar.set("oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  return NextResponse.json({
    google: getGoogleAuthUrl(state),
    github: getGitHubAuthUrl(state),
  });
}
