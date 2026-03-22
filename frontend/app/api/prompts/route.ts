import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { CONNECTORS_API_URL, AUTH_COOKIE } from "@/lib/config";

async function token() {
  return (await cookies()).get(AUTH_COOKIE)?.value;
}
function unauth() { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }

export async function GET() {
  const t = await token();
  if (!t) return unauth();
  const res = await fetch(`${CONNECTORS_API_URL}/api/prompts/`, { headers: { Authorization: `Bearer ${t}` } });
  const payload = await res.json();
  if (!res.ok) return NextResponse.json({ error: payload.detail }, { status: res.status });
  return NextResponse.json(payload);
}

export async function POST(request: NextRequest) {
  const t = await token();
  if (!t) return unauth();
  const body = await request.json();
  const res = await fetch(`${CONNECTORS_API_URL}/api/prompts/`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
    body: JSON.stringify(body),
  });
  const payload = await res.json();
  if (!res.ok) return NextResponse.json({ error: payload.detail }, { status: res.status });
  return NextResponse.json(payload, { status: 201 });
}
