import { NextResponse } from "next/server";

/**
 * Companion avatar generation via DiceBear v7 — completely free, no API key.
 * Cost: $0. Returns a deterministic SVG URL based on the companion name.
 */

export async function POST(request: Request) {
  let body: { name?: string; gender?: string; race?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const avatarUrl = `https://api.dicebear.com/7.x/personas/svg?seed=${encodeURIComponent(name)}&backgroundColor=1a1a2e`;

  return NextResponse.json({ avatarUrl });
}
