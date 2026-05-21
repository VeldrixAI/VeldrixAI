import { NextResponse } from "next/server";
import { AUTH_API_URL } from "@/lib/config";

export async function GET() {
  try {
    const res = await fetch(`${AUTH_API_URL}/billing/configured`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) {
      return NextResponse.json({ configured: false }, { status: 200 });
    }
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({ configured: false }, { status: 200 });
  }
}
