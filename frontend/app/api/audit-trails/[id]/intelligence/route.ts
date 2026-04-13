import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { CONNECTORS_API_URL, AUTH_COOKIE } from "@/lib/config";

async function token() {
  return (await cookies()).get(AUTH_COOKIE)?.value;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const t = await token();
  if (!t) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const forceRefresh = req.nextUrl.searchParams.get("force_refresh") === "true";
  const qs = forceRefresh ? "?force_refresh=true" : "";

  const res = await fetch(
    `${CONNECTORS_API_URL}/api/audit-trails/${id}/intelligence${qs}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${t}`,
        "Content-Type": "application/json",
      },
    }
  );

  const payload = await res.json();
  return NextResponse.json(payload, { status: res.status });
}
