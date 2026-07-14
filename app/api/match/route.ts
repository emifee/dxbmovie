import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { routeChat, type AIChatMessage } from "@/lib/ai-router";

/**
 * POST /api/match
 * Body: { username: string, swipes: { title: string, liked: boolean }[] }
 *
 * Compares the visitor's 3 quick swipes against the host user's Movie DNA,
 * returning a percentage match and a witty one-liner from the AI.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { username, swipes } = body as {
      username: string;
      swipes: { title: string; liked: boolean }[];
    };

    if (!username || !Array.isArray(swipes) || swipes.length === 0) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    // Fetch host user's DNA (genres + watchlist) ---
    const client = await clientPromise;
    const db = client.db("dxbmovies");

    const userQuery: any = { $or: [{ username }] };
    if (ObjectId.isValid(username)) {
      userQuery.$or.push({ _id: new ObjectId(username) });
    }
    const userDoc = await db.collection("users").findOne(userQuery);
    if (!userDoc) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const userId = userDoc._id.toString();
    const [prefs, watchlistItems] = await Promise.all([
      db.collection("userPreferences").findOne({ userId }),
      db.collection("watchlists").find({ userId }).limit(20).toArray(),
    ]);

    const hostGenres = prefs?.genres ?? [];
    const hostWatchlist = watchlistItems.map((w: any) => w.movie?.title).filter(Boolean);

    // Build a prompt for the AI to calculate the match ---
    const visitorLiked = swipes.filter((s) => s.liked).map((s) => s.title);
    const visitorDisliked = swipes.filter((s) => !s.liked).map((s) => s.title);

    const systemPrompt: AIChatMessage = {
      role: "system",
      content: `You are a fun movie matchmaker. You will be given:
1. HOST's movie DNA (their favorite genres and watchlist).
2. VISITOR's quick swipes (movies they liked and disliked).

Calculate a realistic match percentage (0-100) based on genre overlap, taste similarity, and movie choices.
Then write ONE short, witty, fun sentence describing their compatibility. Keep it under 20 words.

Reply ONLY with valid JSON, no markdown, no code fences:
{"score": 85, "description": "You both live for mind-bending sci-fi thrillers!"}`,
    };

    const userMessage: AIChatMessage = {
      role: "user",
      content: JSON.stringify({
        host: {
          name: userDoc.name || "this user",
          favoriteGenres: hostGenres,
          watchlist: hostWatchlist.slice(0, 15),
        },
        visitor: {
          liked: visitorLiked,
          disliked: visitorDisliked,
        },
      }),
    };

    const aiResult = await routeChat([systemPrompt, userMessage]);

    // Parse the AI response ---
    let score = 50;
    let description = "You've got some interesting taste overlap!";

    try {
      const parsed = JSON.parse(aiResult.text);
      if (typeof parsed.score === "number") score = Math.min(100, Math.max(0, parsed.score));
      if (typeof parsed.description === "string") description = parsed.description;
    } catch {
      console.warn("[match] AI returned non-JSON, using defaults");
    }

    return NextResponse.json({ score, description, hostName: userDoc.name || "Movie Fan" });
  } catch (err) {
    console.error("[match] Error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
