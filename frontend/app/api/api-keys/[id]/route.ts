import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { AUTH_API_URL, AUTH_COOKIE } from "@/lib/config";

async function getToken() {
  const jar = await cookies();
  return jar.get(AUTH_COOKIE)?.value;
}

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = await getToken();
  if (!token) return unauthorized();

  const { id } = await params;

  try {
    const body = await request.json();
    const response = await fetch(`${AUTH_API_URL}/api-keys/${id}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: body.name }),
    });
    if (!response.ok) {
      const error = await response.json();
      return NextResponse.json(error, { status: response.status });
    }
    return NextResponse.json(await response.json());
  } catch {
    return NextResponse.json({ error: "Failed to update API key" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = await getToken();
  if (!token) return unauthorized();

  const { id } = await params;
  
  // Get the permanent query parameter from the request URL
  const { searchParams } = new URL(request.url);
  const permanent = searchParams.get('permanent');
  
  // Build the backend URL with query parameter if present
  const backendUrl = permanent 
    ? `${AUTH_API_URL}/api-keys/${id}?permanent=${permanent}`
    : `${AUTH_API_URL}/api-keys/${id}`;

  try {
    const response = await fetch(backendUrl, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.status === 204) return NextResponse.json({ ok: true });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      return NextResponse.json({ error: error.detail || "Not found" }, { status: response.status });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete API key" }, { status: 500 });
  }
}
