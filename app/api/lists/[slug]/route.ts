import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";

export const dynamic = "force-dynamic";

// GET /api/lists/[slug] — public endpoint, no auth needed
export async function GET(request: Request, { params }: { params: { slug: string } }) {
  const client = await clientPromise;
  const db = client.db();

  const list = await db.collection("lists").findOne({ slug: params.slug, published: true });
  if (!list) {
    return NextResponse.json({ error: "List not found" }, { status: 404 });
  }

  // Check if creator is online (last seen within 10 min)
  const ONLINE_THRESHOLD_MS = 10 * 60 * 1000;
  const onlineCutoff = new Date(Date.now() - ONLINE_THRESHOLD_MS).toISOString();
  const creator = await db.collection("users").findOne({ email: list.userId });
  const creatorOnline = creator?.lastSeen >= onlineCutoff;

  return NextResponse.json({
    ...list,
    _id: list._id.toString(),
    creatorOnline,
    creatorAvatar: creator?.image || null,
  });
}
