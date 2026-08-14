import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { COVER_THEME_IDS } from "@/lib/cover-theme";

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
      coverTheme: userDoc?.coverTheme || null,
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

/**
 * PATCH /api/user/profile — update user-editable profile fields.
 * Body: { coverTheme: string }
 */
export async function PATCH(request: Request) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { coverTheme?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { coverTheme } = body;
  // Validate against the known ids — the stored value is resolved into a CSS
  // class on render, so an arbitrary client string must never reach the DB.
  if (typeof coverTheme !== "string" || !COVER_THEME_IDS.includes(coverTheme)) {
    return NextResponse.json({ error: "Invalid cover theme" }, { status: 400 });
  }

  try {
    const client = await clientPromise;
    const db = client.db(DB_NAME);
    await db
      .collection("users")
      .updateOne({ _id: new ObjectId(userId) }, { $set: { coverTheme } });

    return NextResponse.json({ ok: true, coverTheme });
  } catch (err) {
    console.error("[profile PATCH]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
