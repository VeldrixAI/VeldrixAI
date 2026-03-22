import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { CONNECTORS_API_URL, AUTH_COOKIE } from "@/lib/config";

export async function GET(request: NextRequest) {
  const t = (await cookies()).get(AUTH_COOKIE)?.value;
  if (!t) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const range = new URL(request.url).searchParams.get("range") ?? "7d";
  const res = await fetch(`${CONNECTORS_API_URL}/api/analytics/latency?range=${range}`, {
    headers: { Authorization: `Bearer ${t}` },
  });
  const payload = await res.json();
  if (!res.ok) return NextResponse.json({ error: payload.detail }, { status: res.status });
  return NextResponse.json(payload);
}
