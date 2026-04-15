import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { AUTH_API_URL, AUTH_COOKIE } from "@/lib/config";

async function getToken() {
  return (await cookies()).get(AUTH_COOKIE)?.value;
}

export async function GET(request: NextRequest) {
  const t = await getToken();
  if (!t) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const params = new URLSearchParams();
  ["page", "limit", "unread_only"].forEach((k) => {
    const v = searchParams.get(k);
    if (v) params.set(k, v);
  });

  const res = await fetch(`${AUTH_API_URL}/notifications/?${params}`, {
    headers: { Authorization: `Bearer ${t}` },
  });
  const payload = await res.json();
  if (!res.ok) return NextResponse.json({ error: payload.detail }, { status: res.status });
  return NextResponse.json(payload);
}

export async function PATCH(request: NextRequest) {
  const t = await getToken();
  if (!t) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const res = await fetch(`${AUTH_API_URL}/notifications/mark-read`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${t}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = await res.json();
  if (!res.ok) return NextResponse.json({ error: payload.detail }, { status: res.status });
  return NextResponse.json(payload);
}
