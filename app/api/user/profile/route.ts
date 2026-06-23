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

    // Calculate Decaying Taste Profile Accuracy
    const dnaCount = prefs?.dna?.length || 0;
    // Base accuracy: 50% + 5% per DNA trait (max 95%)
    let baseAccuracy = 50 + (dnaCount * 5);
    if (baseAccuracy > 95) baseAccuracy = 95;
    if (dnaCount === 0) baseAccuracy = 0; // 0 if no DNA

    let accuracyScore = baseAccuracy;
    let accuracyMessage = "Sonia is still learning about you.";
    
    if (baseAccuracy > 0) {
      const lastInteraction = prefs?.lastInteractionAt ? new Date(prefs.lastInteractionAt) : new Date();
      const now = new Date();
      const diffMs = now.getTime() - lastInteraction.getTime();
      const daysSince = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      
      // Decay: drop 1.5% per day of inactivity
      const decay = daysSince * 1.5;
      accuracyScore = Math.max(0, Math.floor(baseAccuracy - decay));
      
      if (daysSince > 2) {
        accuracyMessage = `Sonia's understanding of your taste is ${accuracyScore}% accurate. She hasn't learned anything new in ${daysSince} days — accuracy is dropping.`;
      } else {
        accuracyMessage = `Sonia's understanding of your taste is ${accuracyScore}% accurate.`;
      }
    }

    return NextResponse.json({
      discussed,
      watchlistCount,
      chatCount,
      genres,
      joinedAt,
      accuracyScore,
      accuracyMessage,
    });
  } catch (err) {
    console.error("[profile GET]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
