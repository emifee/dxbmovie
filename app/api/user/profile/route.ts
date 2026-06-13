import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import clientPromise from "@/lib/mongodb";

const DB_NAME = "dxbmovies";

async function getUserId() {
  const session = await getServerSession(authOptions);
  return (session?.user as { id?: string } | undefined)?.id ?? null;
}

/**
 * GET /api/user/profile — aggregated profile stats.
 * Returns: { discussed, watchlistCount, chatCount, genres, joinedAt }
 */
export async function GET() {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const client = await clientPromise;
    const db = client.db(DB_NAME);

    // Run counts in parallel.
    const [watchlistCount, chatSessions, prefs, userDoc] = await Promise.all([
      db.collection("watchlists").countDocuments({ userId }),
      db.collection("chatSessions").find({ userId }).toArray(),
      db.collection("userPreferences").findOne({ userId }),
      db.collection("users").findOne({ _id: userId as unknown as import("mongodb").ObjectId }),
    ]);

    // Count total unique movies the user discussed (based on chat session messages).
    // A "discussed" movie = any session where the AI replied.
    const chatCount = chatSessions.length;
    // Count sessions that have at least one user message as "discussed" topics.
    const discussed = chatSessions.filter((s) =>
      Array.isArray(s.messages) && s.messages.some((m: { role: string }) => m.role === "user"),
    ).length;

    const genres: string[] = prefs?.genres ?? [];

    // Try to get joined date from the next-auth users collection.
    let joinedAt: string | null = null;
    if (userDoc?.createdAt) {
      joinedAt = new Date(userDoc.createdAt).toISOString();
    }

    return NextResponse.json({
      discussed,
      watchlistCount,
      chatCount,
      genres,
      joinedAt,
    });
  } catch (err) {
    console.error("[profile GET]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
