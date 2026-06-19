import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import clientPromise from "@/lib/mongodb";
import { routeChat, type AIChatMessage } from "@/lib/ai-router";
import { sendPushNotification, type PushSubscriptionData } from "@/lib/push";
import type { Movie } from "@/lib/types";

const TMDB_BASE = "https://api.themoviedb.org/3";

const SYSTEM_PROMPT = `You are DXBmovies, a smart and passionate movie companion. You know everything about films, TV shows, directors, actors, and storytelling. You give personalized recommendations based on the user's mood, taste, and watch history. You are concise, engaging, and conversational — never robotic. You understand streaming availability in the MENA region including Netflix, Prime Video, OSN, Shahid, Starz Play, and Watch It. Always recommend something the user can actually watch right now.

LANGUAGE RULE: Always reply in the SAME language the user writes in. If they write in Arabic, reply in Arabic. Match their language exactly.

ACTIVE ENGAGEMENT RULE: Always keep the conversation going. Ask a follow-up question at the end of your response. If the user watched a recommendation, ask for their feedback to learn their taste.

REAL-TIME SEARCH RULE: If the user asks factual questions about a movie or TV show (e.g. how many seasons, release date, runtime) and you are NOT 100% certain, you MUST output ONLY this exact JSON to trigger a real-time TMDB search: {"action": "search", "query": "Exact title of movie/show"}. Do not output anything else. The system will then reply with the exact TMDB data, and you can give the final answer.

ALWAYS reply with valid JSON and nothing else — no markdown, no code fences:
{"message":"Your reply here","recommendations":["Title 1","Title 2","Title 3"],"memories":["Fact 1","Fact 2"]}

When NOT recommending titles use an empty array for recommendations:
{"message":"Your reply here","recommendations":[],"memories":[]}

MEMORY EXTRACTION RULE: In the "memories" array, extract any specific facts about the user's movie/TV preferences, tastes, or feedback from their LATEST message. Keep facts concise (e.g., "Loved Interstellar", "Hates horror", "Prefers Tom Cruise action films"). If nothing to extract, use an empty array.

POSTER / IMAGE RULE: Whenever the user asks to see a poster, image, cover art, or visual for ANY movie or TV show — put that exact title in the "recommendations" array. The app will automatically fetch and display the poster card with the real image. NEVER say you cannot show images. NEVER say to search online. Just include the title in recommendations and confirm you are showing it. Example: user says "can I see the poster for Midnight Mass" → put "Midnight Mass" in recommendations and say something like "Here's the Midnight Mass poster! …".

RECOMMENDATION RULE: Only populate "recommendations" when the user explicitly asks for suggestions, asks to see a poster/image, or you are actively recommending titles. Mix Movies and TV Shows. If the user is just chatting or asking facts, leave recommendations EMPTY.

Rules: only real films/shows, 2-3 titles when suggesting, stay on topic.
CRITICAL: If the user already watched your recommendations, immediately suggest 3 new similar titles without asking more questions.`;


async function searchTMDB(title: string, apiKey: string): Promise<Movie | null> {
  try {
    const res = await fetch(
      `${TMDB_BASE}/search/multi?api_key=${apiKey}&query=${encodeURIComponent(title)}&include_adult=false`,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { results: Record<string, unknown>[] };
    const hit = data.results.find((r) => r.poster_path && (r.media_type === "movie" || r.media_type === "tv"));
    if (!hit) return null;
    const releaseDate = ((hit.release_date ?? hit.first_air_date ?? "") as string).slice(0, 4);
    return {
      id: hit.id as number,
      title: (hit.title ?? hit.name ?? title) as string,
      year: releaseDate,
      rating: Math.round(((hit.vote_average as number) ?? 0) * 10) / 10,
      posterPath: (hit.poster_path as string | null) ?? null,
      overview: (hit.overview as string) ?? "",
      genres: [],
      cast: [],
      mediaType: (hit.media_type as "movie" | "tv") ?? "movie",
    };
  } catch {
    return null;
  }
}

async function fetchTMDBDataForAI(query: string, apiKey: string): Promise<string> {
  try {
    const res = await fetch(`${TMDB_BASE}/search/multi?api_key=${apiKey}&query=${encodeURIComponent(query)}&include_adult=false`);
    if (!res.ok) return "Search failed.";
    const data = (await res.json()) as any;
    const hit = data.results.find((r: any) => r.media_type === "tv" || r.media_type === "movie");
    if (!hit) return "No results found on TMDB.";

    if (hit.media_type === "tv") {
      const tvRes = await fetch(`${TMDB_BASE}/tv/${hit.id}?api_key=${apiKey}`);
      if (!tvRes.ok) return `TV Show: ${hit.name}. Overview: ${hit.overview}`;
      const tv = await tvRes.json();
      return `[REAL-TIME TMDB DATA] TV Show: ${tv.name}. First aired: ${tv.first_air_date}. Seasons: ${tv.number_of_seasons}. Episodes: ${tv.number_of_episodes}. Status: ${tv.status}. Overview: ${tv.overview}`;
    } else {
      const mRes = await fetch(`${TMDB_BASE}/movie/${hit.id}?api_key=${apiKey}`);
      if (!mRes.ok) return `Movie: ${hit.title}. Release: ${hit.release_date}. Overview: ${hit.overview}`;
      const m = await mRes.json();
      return `[REAL-TIME TMDB DATA] Movie: ${m.title}. Release: ${m.release_date}. Runtime: ${m.runtime} mins. Status: ${m.status}. Overview: ${m.overview}`;
    }
  } catch {
    return "Search failed.";
  }
}

export async function POST(request: Request) {
  const tmdbKey = process.env.TMDB_API_KEY;

  let body: { messages: { role: string; content: string }[]; movieContext?: string; imageDataUrl?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { messages, movieContext, imageDataUrl } = body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "messages array required" }, { status: 400 });
  }

  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;
  const userName = session?.user?.name ?? null;

  // Guest limit: allow 3 messages without an account so they experience the AI value
  if (!userId) {
    const userMessageCount = messages.filter((m) => m.role === "user").length;
    if (userMessageCount > 3) {
      return NextResponse.json({
        content: "You've used your 3 free messages! Sign in to unlock unlimited AI chats, personalized picks, and your watchlist — it takes 2 seconds 🎬",
        recommendations: [],
      });
    }
  }

  // Build user context string from MongoDB prefs + watchlist + reactions
  let userContextStr = "";
  if (userId) {
    try {
      const client = await clientPromise;
      const db = client.db("dxbmovies");
      const [prefs, watchlistItems, reactions] = await Promise.all([
        db.collection("userPreferences").findOne({ userId }),
        db.collection("watchlists").find({ userId }).limit(20).toArray(),
        db.collection("reactions").find({ userId, reaction: { $in: ["like", "dislike"] } }).limit(50).toArray(),
      ]);

      const genres = prefs?.genres || [];
      const memories = prefs?.memories || [];
      const watchlistTitles = watchlistItems.map((m: any) => m.movie?.title).filter(Boolean);

      const likedTitles = reactions
        .filter((r: any) => r.reaction === "like" && r.movieTitle)
        .map((r: any) => r.movieTitle);
      const dislikedTitles = reactions
        .filter((r: any) => r.reaction === "dislike" && r.movieTitle)
        .map((r: any) => r.movieTitle);

      // Build genre preference score from DNA + liked movie genres
      const likedGenres: string[] = reactions
        .filter((r: any) => r.reaction === "like" && Array.isArray(r.movieGenres))
        .flatMap((r: any) => r.movieGenres as string[]);
      const dislikedGenres: string[] = reactions
        .filter((r: any) => r.reaction === "dislike" && Array.isArray(r.movieGenres))
        .flatMap((r: any) => r.movieGenres as string[]);

      userContextStr = "\n\nUSER PROFILE:\n";
      if (userName) userContextStr += `- Name: ${userName}\n`;
      if (genres.length > 0) userContextStr += `- Favourite Genres (DNA): ${genres.join(", ")}\n`;
      if (likedGenres.length > 0) {
        // Deduplicate and count genre frequency for ranking
        const freq = likedGenres.reduce<Record<string, number>>((acc, g) => { acc[g] = (acc[g] || 0) + 1; return acc; }, {});
        const ranked = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([g]) => g);
        userContextStr += `- Genres they enjoy (from likes): ${ranked.join(", ")}\n`;
      }
      if (dislikedGenres.length > 0) {
        const freq = dislikedGenres.reduce<Record<string, number>>((acc, g) => { acc[g] = (acc[g] || 0) + 1; return acc; }, {});
        const ranked = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([g]) => g);
        userContextStr += `- Genres to AVOID (from dislikes): ${ranked.join(", ")}\n`;
      }
      if (memories.length > 0) userContextStr += `- Known Taste Notes: ${memories.join(" | ")}\n`;
      if (likedTitles.length > 0) userContextStr += `- Movies/Shows they LIKED: ${likedTitles.slice(0, 10).join(", ")}\n`;
      if (dislikedTitles.length > 0) userContextStr += `- Movies/Shows they DISLIKED (do NOT recommend these or similar): ${dislikedTitles.slice(0, 10).join(", ")}\n`;
      if (watchlistTitles.length > 0) userContextStr += `- Watchlist (already saved, avoid re-recommending): ${watchlistTitles.join(", ")}\n`;
      userContextStr += "Use this profile to give highly personalised recommendations. Never suggest disliked titles or genres.";
    } catch (e) {
      console.error("Failed to fetch user context", e);
    }
  }

  // Build system prompt
  let systemContent = movieContext
    ? `${SYSTEM_PROMPT}\n\nThe user opened this conversation from the movie page for: "${movieContext}". Start by talking about that movie.`
    : SYSTEM_PROMPT;
  systemContent += userContextStr;

  // Convert conversation history to the standard format
  const chatMessages: AIChatMessage[] = [{ role: "system", content: systemContent }];

  for (const m of messages) {
    if (m.role === "user" || m.role === "assistant") {
      chatMessages.push({ role: m.role, content: m.content });
    }
  }

  // Append image description to last user message if present
  if (imageDataUrl && chatMessages.length > 0) {
    const last = chatMessages[chatMessages.length - 1];
    if (last.role === "user") {
      last.content += "\n[User attached an image for analysis — describe and discuss it in the context of movies/TV.]";
    }
  }

  try {
    let { text, provider } = await routeChat(chatMessages);

    let parsed: { message: string; recommendations: string[]; memories?: string[]; action?: string; query?: string } = { message: "", recommendations: [] };
    let wantsSearch = false;

    try {
      // Strip markdown code fences, then extract the first {...} JSON block.
      const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
      const start = stripped.indexOf("{");
      const end = stripped.lastIndexOf("}");
      if (start !== -1 && end !== -1) {
        const cleaned = stripped.slice(start, end + 1);
        parsed = JSON.parse(cleaned);
        if (parsed.action === "search" && parsed.query) {
          wantsSearch = true;
        }
      }
    } catch {
      // Ignore initial parse error, handled below
    }

    // --- TWO-PASS REAL-TIME SEARCH LOGIC ---
    if (wantsSearch && parsed.query && tmdbKey) {
      console.log(`[api/chat] AI requested real-time search for: ${parsed.query}`);
      const searchResult = await fetchTMDBDataForAI(parsed.query, tmdbKey);
      
      // Provide the data back to the LLM
      chatMessages.push({ role: "assistant", content: text });
      chatMessages.push({ 
        role: "user", 
        content: `${searchResult}\n\nNow provide the final response to my original question using this real-time data. Remember to output ONLY valid JSON format: {"message": "...", "recommendations": [], "memories": []}` 
      });

      const secondPass = await routeChat(chatMessages);
      text = secondPass.text;
      
      // Re-parse
      try {
        const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
        const start = stripped.indexOf("{");
        const end = stripped.lastIndexOf("}");
        if (start !== -1 && end !== -1) {
          const cleaned = stripped.slice(start, end + 1);
          parsed = JSON.parse(cleaned);
        } else {
          throw new Error("No JSON object found");
        }
      } catch {
        parsed = { message: text, recommendations: [], memories: [] };
      }
    } else if (!parsed.message && !wantsSearch) {
      // Plain text fallback if the first pass didn't want to search but failed to return JSON
      parsed = { message: text, recommendations: [], memories: [] };
    }

    // Save extracted memories to MongoDB (fire-and-forget)
    if (userId && Array.isArray(parsed.memories) && parsed.memories.length > 0) {
      clientPromise
        .then((client) => {
          const db = client.db("dxbmovies");
          return db.collection("userPreferences").updateOne(
            { userId },
            { $push: { memories: { $each: parsed.memories as string[] } } as any },
            { upsert: true },
          );
        })
        .catch((e) => console.error("Memory save failed", e));
    }

    // Fetch TMDB movie data for recommended titles
    let movies: Movie[] = [];
    if (tmdbKey && Array.isArray(parsed.recommendations) && parsed.recommendations.length > 0) {
      const results = await Promise.all(
        parsed.recommendations.slice(0, 3).map((title) => searchTMDB(title, tmdbKey)),
      );
      movies = results.filter((m): m is Movie => m !== null);
    }

    // Log provider for monitoring (visible in pm2 logs)
    console.log(`[api/chat] provider=${provider} userId=${userId ?? "guest"}`);

    // Send push notification if the user has push enabled and the app is backgrounded.
    // We check the X-App-Backgrounded header (client sets this when the user hides the page).
    const appBackgrounded = request.headers.get("X-App-Backgrounded") === "true";
    if (userId && appBackgrounded) {
      // Fire-and-forget — don't block the response
      clientPromise
        .then(async (client) => {
          const db = client.db("dxbmovies");
          const prefs = await db.collection("userPreferences").findOne({ userId });
          if (prefs?.pushEnabled && prefs?.pushSubscription) {
            const sub = prefs.pushSubscription as PushSubscriptionData;
            const previewBody = parsed.message.length > 100
              ? parsed.message.slice(0, 97) + "…"
              : parsed.message;
            const result = await sendPushNotification(sub, {
              title: "Sonia replied 🎬",
              body: previewBody,
              url: "/",
              type: "ai_response",
            });
            // Clean up expired subscriptions
            if (result.gone) {
              await db.collection("userPreferences").updateOne(
                { userId },
                { $set: { pushEnabled: false }, $unset: { pushSubscription: "" } },
              );
            }
          }
        })
        .catch((e) => console.error("[push] Chat notification failed:", e));
    }

    return NextResponse.json({ content: parsed.message, recommendations: movies, provider });
  } catch (err) {
    console.error("[api/chat] All providers failed:", err);
    return NextResponse.json(
      { content: "Sorry, our AI is taking a quick break — please try again in a moment! 🎬", recommendations: [] },
      { status: 200 },
    );
  }
}
