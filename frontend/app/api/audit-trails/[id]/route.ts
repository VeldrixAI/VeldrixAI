import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { CONNECTORS_API_URL, AUTH_COOKIE } from "@/lib/config";

async function token() {
  return (await cookies()).get(AUTH_COOKIE)?.value;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const t = await token();
  if (!t) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const res = await fetch(`${CONNECTORS_API_URL}/api/audit-trails/${id}/detail`, {
    headers: { Authorization: `Bearer ${t}` },
  });

  const payload = await res.json();
  if (!res.ok) return NextResponse.json({ error: payload.detail }, { status: res.status });
  return NextResponse.json(payload);
}
