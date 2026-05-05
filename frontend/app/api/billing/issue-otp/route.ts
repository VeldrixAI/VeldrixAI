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
    const res = await fetch(`${AUTH_API_URL}/billing/issue-otp`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        payment_intent_id: body.payment_intent_id,
        payment_method_id: body.payment_method_id,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to issue verification code" }));
      return NextResponse.json({ error: err.detail }, { status: res.status });
    }
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({ error: "Failed to issue verification code" }, { status: 500 });
  }
}
