import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { getTasteTitle } from "@/lib/utils";

export async function GET(request: Request, { params }: { params: { username: string } }) {
  const { username } = params;

  if (!username) {
    return NextResponse.json({ error: "Username required" }, { status: 400 });
  }

  try {
    const client = await clientPromise;
    const db = client.db("dxbmovies");

    // Allow fetching by custom username or fallback MongoDB ObjectId
    const userQuery: any = { $or: [{ username }] };
    if (ObjectId.isValid(username)) {
      userQuery.$or.push({ _id: new ObjectId(username) });
    }

    const userDoc = await db.collection("users").findOne(userQuery);
    if (!userDoc) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const userId = userDoc._id.toString();

    const [prefs, watchlistItems, chatSessions] = await Promise.all([
      db.collection("userPreferences").findOne({ userId }),
      db.collection("watchlists").find({ userId }).limit(4).toArray(),
      db.collection("chatSessions").countDocuments({ userId }),
    ]);

    const watchlistCount = await db.collection("watchlists").countDocuments({ userId });
    
    // Calculate stats
    const topGenre = (prefs?.genres && prefs.genres.length > 0) ? prefs.genres[0] : null;
    const tasteTitle = getTasteTitle(topGenre);
    const interactionCount = watchlistCount + chatSessions; // Proxy for "movies tracked"

    const topMovies = watchlistItems.map((w: any) => ({
      id: w.movie.id,
      title: w.movie.title,
      posterPath: w.movie.posterPath || w.movie.poster_path,
    }));

    // EXPLICIT DTO ALLOWLIST - Never spread the full user object to avoid leaking emails/auth data
    const publicProfileDTO = {
      name: userDoc.name || "Movie Fan",
      image: userDoc.image || null,
      username: userDoc.username || userId,
      tasteTitle,
      topGenre,
      stats: {
        interactionCount,
      },
      topMovies,
    };

    return NextResponse.json(publicProfileDTO);
  } catch (err) {
    console.error("[public user GET]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
