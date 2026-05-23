import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { CONNECTORS_API_URL, AUTH_COOKIE } from "@/lib/config";

async function getToken() {
  const jar = await cookies();
  return jar.get(AUTH_COOKIE)?.value;
}

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET() {
  const token = await getToken();
  if (!token) return unauthorized();

  try {
    const res = await fetch(`${CONNECTORS_API_URL}/api/support/tickets`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const payload = await res.json();
    if (!res.ok) return NextResponse.json({ error: payload.detail }, { status: res.status });
    return NextResponse.json(payload);
  } catch {
    return NextResponse.json({ error: "Failed to fetch support tickets" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const token = await getToken();
  if (!token) return unauthorized();

  try {
    const body = await request.json();
    const res = await fetch(`${CONNECTORS_API_URL}/api/support/tickets`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    const payload = await res.json();
    if (!res.ok) {
      return NextResponse.json(
        { error: payload.detail ?? payload.error ?? "Submission failed" },
        { status: res.status },
      );
    }
    return NextResponse.json(payload, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to submit support ticket" }, { status: 500 });
  }
}
