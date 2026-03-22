import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { AUTH_API_URL, AUTH_COOKIE } from "@/lib/config";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const res = await fetch(`${AUTH_API_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: body.email, password: body.password }),
    });

    const payload = await res.json();

    if (!res.ok) {
      return NextResponse.json(
        { error: payload.detail || "Signup failed" },
        { status: res.status }
      );
    }

    // Auto-login after signup
    const loginRes = await fetch(`${AUTH_API_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: body.email, password: body.password }),
    });

    const loginPayload = await loginRes.json();

    if (loginRes.ok) {
      const jar = await cookies();
      jar.set(AUTH_COOKIE, loginPayload.access_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Signup failed" },
      { status: 500 }
    );
  }
}
