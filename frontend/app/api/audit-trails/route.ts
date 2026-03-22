import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { CONNECTORS_API_URL, AUTH_COOKIE } from "@/lib/config";

async function token() {
  return (await cookies()).get(AUTH_COOKIE)?.value;
}

export async function GET(request: NextRequest) {
  const t = await token();
  if (!t) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const params = new URLSearchParams();
  ["page", "limit", "action_type", "search"].forEach((k) => {
    const v = searchParams.get(k);
    if (v) params.set(k, v);
  });

  const export_ = searchParams.get("export");
  const path = export_ ? "export" : "";
  const url = `${CONNECTORS_API_URL}/api/audit-trails/${path}?${params}`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${t}` } });

  if (export_) {
    const text = await res.text();
    return new NextResponse(text, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": "attachment; filename=audit-trails.csv",
      },
    });
  }

  const payload = await res.json();
  if (!res.ok) return NextResponse.json({ error: payload.detail }, { status: res.status });
  return NextResponse.json(payload);
}

export async function POST(request: NextRequest) {
  const t = await token();
  if (!t) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const res = await fetch(`${CONNECTORS_API_URL}/api/audit-trails/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${t}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = await res.json();
  if (!res.ok) return NextResponse.json({ error: payload.detail }, { status: res.status });
  return NextResponse.json(payload, { status: 201 });
}
