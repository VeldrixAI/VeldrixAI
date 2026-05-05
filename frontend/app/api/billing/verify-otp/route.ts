import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { AUTH_API_URL, AUTH_COOKIE } from "@/lib/config";

async function getToken() {
  const jar = await cookies();
  return jar.get(AUTH_COOKIE)?.value;
}

export async function POST(request: NextRequest) {
  const token = await getToken();
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const res = await fetch(`${AUTH_API_URL}/billing/verify-otp`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        payment_intent_id: body.payment_intent_id,
        otp: body.otp,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Verification failed" }));
      return NextResponse.json({ error: err.detail }, { status: res.status });
    }
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({ error: "Verification failed" }, { status: 500 });
  }
}
