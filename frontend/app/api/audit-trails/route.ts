import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { CONNECTORS_API_URL, AUTH_COOKIE } from "@/lib/config";
import { safeJson, serviceUnavailable, errorMessage } from "@/lib/proxy";

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

  try {
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

    const payload = await safeJson(res);
    if (!res.ok) {
      return NextResponse.json({ error: errorMessage(payload, "Failed to load audit logs") }, { status: res.status });
    }
    return NextResponse.json(payload);
  } catch {
    return serviceUnavailable("audit log service");
  }
}

export async function POST(request: NextRequest) {
  const t = await token();
  if (!t) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  try {
    const res = await fetch(`${CONNECTORS_API_URL}/api/audit-trails/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${t}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const payload = await safeJson(res);
    if (!res.ok) {
      return NextResponse.json({ error: errorMessage(payload, "Failed to write audit log") }, { status: res.status });
    }
    return NextResponse.json(payload, { status: 201 });
  } catch {
    return serviceUnavailable("audit log service");
  }
}
