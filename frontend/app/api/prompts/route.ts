import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { CONNECTORS_API_URL, AUTH_COOKIE } from "@/lib/config";
import { safeJson, serviceUnavailable, errorMessage } from "@/lib/proxy";

async function token() {
  return (await cookies()).get(AUTH_COOKIE)?.value;
}
function unauth() { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }

export async function GET() {
  const t = await token();
  if (!t) return unauth();
  try {
    const res = await fetch(`${CONNECTORS_API_URL}/api/prompts/`, { headers: { Authorization: `Bearer ${t}` } });
    const payload = await safeJson(res);
    if (!res.ok) return NextResponse.json({ error: errorMessage(payload, "Failed to load prompt library") }, { status: res.status });
    return NextResponse.json(payload);
  } catch {
    return serviceUnavailable("prompt library service");
  }
}

export async function POST(request: NextRequest) {
  const t = await token();
  if (!t) return unauth();
  const body = await request.json();
  try {
    const res = await fetch(`${CONNECTORS_API_URL}/api/prompts/`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
      body: JSON.stringify(body),
    });
    const payload = await safeJson(res);
    if (!res.ok) return NextResponse.json({ error: errorMessage(payload, "Failed to save prompt") }, { status: res.status });
    return NextResponse.json(payload, { status: 201 });
  } catch {
    return serviceUnavailable("prompt library service");
  }
}
