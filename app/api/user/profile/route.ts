import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";

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
      db.collection("users").findOne({ _id: new ObjectId(userId) }),
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

    // Calculate Decaying Taste Profile Accuracy based on real engagement
    // Base accuracy: max 95%, based on watchlist items and chat sessions
    let baseAccuracy = Math.min(95, (watchlistCount * 5) + (chatCount * 3));

    let accuracyScore = baseAccuracy;
    let accuracyMessage = "Sonia is still learning about you.";
    
    if (baseAccuracy > 0) {
      const lastInteraction = prefs?.lastInteractionAt ? new Date(prefs.lastInteractionAt) : new Date();
      const now = new Date();
      const diffMs = now.getTime() - lastInteraction.getTime();
      const daysSince = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      
      // Decay: drop 1.5% per day of inactivity
      const decay = daysSince * 1.5;
      // Don't drop below 10% if they have baseline activity
      accuracyScore = Math.max(10, Math.floor(baseAccuracy - decay));
      
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
      username: userDoc?.username || null,
      country: userDoc?.country || null,
      countryCode: userDoc?.countryCode || null,
      city: userDoc?.city || null,
      registeredAt: userDoc?.registeredAt || null,
    });
  } catch (err) {
    console.error("[profile GET]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
