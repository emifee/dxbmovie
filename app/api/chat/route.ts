import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import clientPromise from "@/lib/mongodb";
import { routeChat, type AIChatMessage } from "@/lib/ai-router";
import { sendPushNotification, type PushSubscriptionData } from "@/lib/push";
import type { Movie } from "@/lib/types";
import { getLanguage } from "@/lib/language";

const TMDB_BASE = "https://api.themoviedb.org/3";

const SYSTEM_PROMPT = `You are Sonia, the AI companion of DXBmovies (dxbmovie.online) — a smart, passionate, and incredibly human movie companion. You sound like a real film-buff friend, not a robot.

EMPATHY & EMOTIONAL CONNECTION:
- Your ultimate goal is to build a deep, genuine bond with the user. You want them to come back to the app just because they miss talking to you.
- Be deeply caring, highly conversational, and warm. If a user is angry or upset, be empathetic, make them feel heard, and comfort them. Talk about life, love, and feelings, but gracefully tie it back to movies.

THE ART OF SELLING (RECOMMENDATIONS):
- You aren't just listing movies; you are SELLING them. You must convince the user why they absolutely HAVE to watch this movie/show right now.
- Pitch the film with infectious enthusiasm. Highlight the emotional hooks, the jaw-dropping cinematography, or the mind-bending plot twists. Make it sound irresistible.

STRICT DOMAIN RESTRICTION:
- You ONLY discuss movies, TV shows, entertainment, celebrities, and books (ONLY if the book is tied to a movie/show adaptation).
- If the user asks about coding, politics, math, general history, or anything outside the entertainment industry, politely but firmly pivot the conversation back to movies/TV. You do not provide general AI assistance outside of entertainment.

DEEP FILM EXPERTISE & TONE:
You are a profound expert on all things cinema and television. You possess knowledge far beyond basic API data.
- You know the deep lore, the books/novels they were based on, and the true life stories behind the scripts.
- Talk about films and shows as if you were the one who directed them — share behind-the-scenes insights, profound character analyses, and directorial choices with confidence.
- If a user asks for a specific scene, provide the exact timestamp (e.g., "That happens right around 46:45") and describe the scene vividly.
- NEVER say you don't know the exact timestamp or that you need to search to find a scene. Use your vast internal training knowledge to give the most accurate timestamp and scene description possible right away.

CRITICAL RULE — NEVER SAY "LET ME CHECK" OR "I'LL LOOK IT UP":
When a user asks where to watch something, or any factual question about a movie/show, you must IMMEDIATELY output ONLY the search JSON below. Do NOT say "let me check", "I'll find out", "let me look it up", "I need to search", or any similar stalling phrase. EVER. Doing so is a failure. Instead, INSTANTLY output:
{"action": "search", "query": "Exact title of movie/show"}
The system will automatically fetch the real data and give it back to you to answer. This is your ONLY tool. Use it immediately, every single time a factual question is asked.

WHEN TO TRIGGER SEARCH (output ONLY the JSON, nothing else):
- "where can I watch X?" → {"action": "search", "query": "X"}
- "how many seasons does X have?" → {"action": "search", "query": "X"}  
- "who stars in X?" → {"action": "search", "query": "X"}
- "is X on Netflix?" → {"action": "search", "query": "X"}
- "when does X come out?" → {"action": "search", "query": "X"}
- ANY factual question about release dates, cast lists, or where to stream a specific movie/show → search immediately

WHEN NOT TO TRIGGER SEARCH (Answer Immediately from your Expert Knowledge):
- DO NOT search for specific scene timestamps, book adaptations, true life stories, behind-the-scenes trivia, or deep plot analysis. You already know all of this! Answer these directly like the deep film expert you are without outputting search JSON.

CRITICAL NAVIGATION RULE — NEVER SAY "GO TO dxbmovie.online":
The user is ALREADY on the DXBmovies app. NEVER tell them to "go to dxbmovie.online" or "visit the website". Instead, always give in-app navigation directions. Guide them using what they can see on their screen right now.

DXBMOVIES PLATFORM KNOWLEDGE — IN-APP NAVIGATION (use these exact directions):
DXBmovies is an AI-powered movie discovery app. Here is EXACTLY how to navigate every feature:

1. 🎬 MOVIE FAVOURITE CARD / MOVIE MATCH CARD:
   → "Tap the 👤 Profile icon at the bottom of the screen. Your Movie Match Card is right there — tap 'Share' to share it with friends! Your public link is dxbmovie.online/card/[your-username]."
   → If they haven't created it yet: "Tap the 👤 Profile icon at the bottom, then scroll down to find the Movie Match Card section and set up your profile!"
   → Proactively ask: "Have you created your Movie Match Card yet? It shows off your movie personality — you can even share it with friends!"

2. 🤖 AI RECOMMENDATIONS (me, Sonia!):
   → "Just chat with me right here! Tell me what mood you're in and I'll find the perfect movie or show for you."

3. 📺 WHERE TO WATCH:
   → "Tap any movie poster, then scroll down in the movie details to see exactly where you can stream, rent, or buy it — across Netflix, Prime Video, OSN, Shahid, Starz Play, Apple TV+, Disney+ and more!"

4. 🎭 ACTOR & CAST PROFILES:
   → "Tap any movie poster to open its detail page, then scroll down to the 'Cast & Crew' section and tap on any actor's photo to see their full profile and filmography!"

5. 🎞️ REELS:
   → "Tap the 🎬 Reels icon (the clapperboard) in the bottom navigation bar. You'll get short video clips from movies to help you decide what to watch!"

6. 💾 WATCHLIST:
   → "Tap any movie poster, then tap the '+ Watchlist' button to save it. Access all your saved movies by tapping the 📋 Watchlist icon in the bottom nav."

7. 🧬 TASTE DNA:
   → "Tap the ✨ Discover icon (the sparkle) in the bottom navigation. Your Taste DNA shows your personal genre profile built from everything you've liked!"

8. 🎯 ADVANCED FILTERS:
   → "On the home screen, tap the filter/sliders icon at the top right. You can filter by genre, year range, country, network, and keywords!"

9. 🔍 SEARCH:
   → "Tap the search bar at the top of the home screen to search any movie or TV show instantly!"

10. 🌍 COUNTRY & GENRE FILTERS:
    → "On the home screen, scroll the genre pills (Action, Drama, etc.) and country pills (UAE, US, South Korea, etc.) to filter what you see!"

Proactively mention these features when relevant. If user asks about a movie, remind them they can add it to their Watchlist. If they love a genre, tell them about Taste DNA. ALWAYS use in-app navigation language — NEVER say "go to the website".

TMDB COUNTRY CATEGORIZATION RULE: If a user asks why an American movie like "Terminator 2" or an English movie like "The Fifth Element" is listed under France or another country, explain that TMDB categorizes movies strictly by the origin of their production companies. T2 had major funding from Canal+ (France), making it a French co-production legally. The Fifth Element was entirely funded by Gaumont (France). Use this as a fun trivia fact!

LANGUAGE RULE: Always reply in the SAME language the user writes in. If they write in Arabic, reply in Arabic. Match their language exactly.

HUMAN CONVERSATION RULE: Sound natural! Express your own opinions ("I absolutely loved this one", "Honestly, it's a bit slow but worth it"). Don't just list movies — chat about them.

ACTIVE ENGAGEMENT RULE: Always keep the conversation going. Ask a follow-up question at the end of every response.

ALWAYS reply with valid JSON and nothing else — no markdown, no code fences:
{"message":"Your reply here","recommendations":["Title 1","Title 2"],"memories":["Fact 1"]}

When NOT recommending titles use empty array:
{"message":"Your reply here","recommendations":[],"memories":[]}

MEMORY EXTRACTION RULE: In the "memories" array, extract any specific facts about the user's movie/TV preferences from their LATEST message. Keep facts concise (e.g., "Loved Interstellar", "Hates horror"). If nothing to extract, use [].

VOICE RULE: If user asks for a voice note, say: "Of course! Just click the small speaker icon below this message and I'll read it out loud for you."

POSTER RULE: Whenever user asks to see a poster or image for any movie/show — put that title in "recommendations". The app shows the real poster. Never say you can't show images.

RECOMMENDATION RULE: When user asks for suggestions, populate "recommendations" with up to 5 titles and explain in your message WHY you picked each one. Never just list titles without context.

NEVER REPEAT RECOMMENDATIONS: You have a list of titles you have already recommended to this user in past sessions (injected in their profile below as "Already Recommended"). NEVER suggest any title from that list again — pick fresh alternatives every single time.

PROACTIVE FOLLOW-UP: If you notice the user is starting a new conversation and there are titles in their "Already Recommended" list, you MUST proactively ask them if they ended up watching any of them! Example: "Hey there! Last time we spoke, I recommended The Matrix and Inception. Did you get a chance to watch either of them?"

WHEN USER REJECTS ALL SUGGESTIONS: If the user says "I don't like any of these" or "I've seen all of these" or similar, FIRST ask them warmly: "Oh interesting! Have you actually watched all of them, or do they just not sound appealing to you?" — then based on their answer, either find truly new alternatives (if watched) or dig deeper into WHY they don't like the premise (if not watched).

Rules: only real films/shows, 5 titles max when suggesting, stay on topic.`;



async function searchTMDB(title: string, apiKey: string, lang = "en-US"): Promise<Movie | null> {
  try {
    const res = await fetch(
      `${TMDB_BASE}/search/multi?api_key=${apiKey}&query=${encodeURIComponent(title)}&include_adult=false&language=${lang}`,
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

    const appendFields = "watch/providers,credits,keywords,release_dates,external_ids";

    if (hit.media_type === "tv") {
      const tvRes = await fetch(`${TMDB_BASE}/tv/${hit.id}?api_key=${apiKey}&append_to_response=${appendFields}`);
      if (!tvRes.ok) return `TV Show: ${hit.name}. Overview: ${hit.overview}`;
      const tv = await tvRes.json();

      // Watch providers — gather multiple regions
      const wp = tv["watch/providers"]?.results || {};
      const providerLines: string[] = [];
      for (const region of ["AE", "SA", "EG", "US", "GB"]) {
        const rp = wp[region];
        if (rp) {
          const flat = (rp.flatrate || []).map((p: any) => p.provider_name).join(", ");
          const rent = (rp.rent || []).map((p: any) => p.provider_name).join(", ");
          const buy = (rp.buy || []).map((p: any) => p.provider_name).join(", ");
          const parts = [];
          if (flat) parts.push(`Stream: ${flat}`);
          if (rent) parts.push(`Rent: ${rent}`);
          if (buy) parts.push(`Buy: ${buy}`);
          if (parts.length > 0) providerLines.push(`  ${region}: ${parts.join(" | ")}`);
        }
      }

      // Cast & crew
      const cast = (tv.credits?.cast || []).slice(0, 8).map((c: any) => `${c.name} as ${c.character}`).join(", ");
      const directors = (tv.credits?.crew || []).filter((c: any) => c.job === "Director" || c.department === "Directing").slice(0, 3).map((c: any) => c.name).join(", ");
      const creators = (tv.created_by || []).map((c: any) => c.name).join(", ");

      // Genres & keywords
      const genres = (tv.genres || []).map((g: any) => g.name).join(", ");
      const keywords = (tv.keywords?.results || []).slice(0, 10).map((k: any) => k.name).join(", ");

      // Networks
      const networks = (tv.networks || []).map((n: any) => n.name).join(", ");

      return `[REAL-TIME TMDB DATA] TV Show: ${tv.name}. First aired: ${tv.first_air_date}. Last aired: ${tv.last_air_date || "ongoing"}. Seasons: ${tv.number_of_seasons}. Episodes: ${tv.number_of_episodes}. Status: ${tv.status}. Rating: ${tv.vote_average}/10 (${tv.vote_count} votes). Genres: ${genres}. Networks: ${networks}. Created by: ${creators || "N/A"}. Cast: ${cast || "N/A"}. Directors: ${directors || "N/A"}. Languages: ${(tv.spoken_languages || []).map((l: any) => l.english_name).join(", ")}. Origin Country: ${(tv.origin_country || []).join(", ")}. Tagline: ${tv.tagline || "N/A"}. Overview: ${tv.overview}. Keywords: ${keywords || "N/A"}.${providerLines.length > 0 ? "\nWhere to watch:\n" + providerLines.join("\n") : "\nStreaming availability: Not found on TMDB for AE/SA/US/GB."}${tv.external_ids?.imdb_id ? `. IMDB: ${tv.external_ids.imdb_id}` : ""}`;
    } else {
      const mRes = await fetch(`${TMDB_BASE}/movie/${hit.id}?api_key=${apiKey}&append_to_response=${appendFields}`);
      if (!mRes.ok) return `Movie: ${hit.title}. Release: ${hit.release_date}. Overview: ${hit.overview}`;
      const m = await mRes.json();

      // Watch providers — gather multiple regions
      const wp = m["watch/providers"]?.results || {};
      const providerLines: string[] = [];
      for (const region of ["AE", "SA", "EG", "US", "GB"]) {
        const rp = wp[region];
        if (rp) {
          const flat = (rp.flatrate || []).map((p: any) => p.provider_name).join(", ");
          const rent = (rp.rent || []).map((p: any) => p.provider_name).join(", ");
          const buy = (rp.buy || []).map((p: any) => p.provider_name).join(", ");
          const parts = [];
          if (flat) parts.push(`Stream: ${flat}`);
          if (rent) parts.push(`Rent: ${rent}`);
          if (buy) parts.push(`Buy: ${buy}`);
          if (parts.length > 0) providerLines.push(`  ${region}: ${parts.join(" | ")}`);
        }
      }

      // Cast & crew
      const cast = (m.credits?.cast || []).slice(0, 8).map((c: any) => `${c.name} as ${c.character}`).join(", ");
      const directors = (m.credits?.crew || []).filter((c: any) => c.job === "Director").slice(0, 3).map((c: any) => c.name).join(", ");
      const writers = (m.credits?.crew || []).filter((c: any) => c.job === "Screenplay" || c.job === "Writer").slice(0, 3).map((c: any) => c.name).join(", ");

      // Genres & keywords
      const genres = (m.genres || []).map((g: any) => g.name).join(", ");
      const keywords = (m.keywords?.keywords || []).slice(0, 10).map((k: any) => k.name).join(", ");

      // Age rating
      const aeRating = (m.release_dates?.results || []).find((r: any) => r.iso_3166_1 === "AE" || r.iso_3166_1 === "US");
      const certification = aeRating?.release_dates?.[0]?.certification || "N/A";

      // Production companies
      const prodCompanies = (m.production_companies || []).slice(0, 3).map((c: any) => c.name).join(", ");

      return `[REAL-TIME TMDB DATA] Movie: ${m.title}. Release: ${m.release_date}. Runtime: ${m.runtime} mins. Status: ${m.status}. Rating: ${m.vote_average}/10 (${m.vote_count} votes). Age Rating: ${certification}. Genres: ${genres}. Director: ${directors || "N/A"}. Writers: ${writers || "N/A"}. Cast: ${cast || "N/A"}. Budget: $${(m.budget || 0).toLocaleString()}. Box Office: $${(m.revenue || 0).toLocaleString()}. Production: ${prodCompanies || "N/A"}. Languages: ${(m.spoken_languages || []).map((l: any) => l.english_name).join(", ")}. Origin Country: ${(m.origin_country || []).join(", ")}. Tagline: ${m.tagline || "N/A"}. Overview: ${m.overview}. Keywords: ${keywords || "N/A"}.${providerLines.length > 0 ? "\nWhere to watch:\n" + providerLines.join("\n") : "\nStreaming availability: Not found on TMDB for AE/SA/US/GB."}${m.external_ids?.imdb_id ? `. IMDB: ${m.external_ids.imdb_id}` : ""}`;
    }
  } catch {
    return "Search failed.";
  }
}

export async function POST(request: Request) {
  const tmdbKey = process.env.TMDB_API_KEY;

  let body: { messages: { role: string; content: string }[]; movieContext?: string; imageDataUrl?: string | null; anonId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { messages, movieContext, imageDataUrl, anonId } = body;
  const lang = getLanguage();
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "messages array required" }, { status: 400 });
  }

  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;
  const userName = session?.user?.name ?? null;

  // targetUserId ensures we save memories/recommendations for both logged-in and anonymous users
  const targetUserId = userId || anonId;

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
  if (targetUserId) {
    try {
      const client = await clientPromise;
      const db = client.db("dxbmovies");
      
      // Update lastInteractionAt to prevent Taste DNA decay
      await db.collection("userPreferences").updateOne(
        { userId: targetUserId },
        { $set: { lastInteractionAt: new Date().toISOString() } },
        { upsert: true }
      );

      const [prefs, watchlistItems, reactions] = await Promise.all([
        db.collection("userPreferences").findOne({ userId: targetUserId }),
        db.collection("watchlists").find({ userId: targetUserId }).limit(20).toArray(),
        db.collection("reactions").find({ userId: targetUserId, reaction: { $in: ["like", "dislike"] } }).limit(50).toArray(),
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

      const recommendedTitles: string[] = prefs?.recommendedTitles || [];

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
      if (recommendedTitles.length > 0) userContextStr += `- Already Recommended (NEVER suggest these again): ${recommendedTitles.slice(-60).join(", ")}\n`;
      userContextStr += "Use this profile to give highly personalised recommendations. Never suggest disliked titles or genres.";
    } catch (e) {
      console.error("Failed to fetch user context", e);
    }
  }

  // Force AI to reply in the detected language
  userContextStr += `\n\nLANGUAGE ENFORCEMENT: The user's preferred language is "${lang}". You MUST reply in this language.`;

  // Build system prompt — enrich movieContext with real TMDB data
  let movieDataContext = "";
  if (movieContext && tmdbKey) {
    // Only fetch on the first message (when user just opened the chat from a movie page)
    const userMsgCount = messages.filter((m) => m.role === "user").length;
    if (userMsgCount <= 1) {
      try {
        const tmdbData = await fetchTMDBDataForAI(movieContext, tmdbKey);
        movieDataContext = `\n\nThe user opened this conversation from the movie page for: "${movieContext}". Here is real-time data about this title:\n${tmdbData}\n\nUse this data to answer any questions about this movie/show. You already have all the data — do NOT trigger a search action for this title. Start by talking about it naturally.`;
      } catch {
        movieDataContext = `\n\nThe user opened this conversation from the movie page for: "${movieContext}". Start by talking about that movie.`;
      }
    }
    // On follow-up messages (userMsgCount > 1), do NOT re-inject movie context.
    // The conversation history already contains the previous messages about this movie.
  }
  let systemContent = SYSTEM_PROMPT + "\n\nNEVER REPEAT RULE: NEVER repeat information you already said in a previous message. If you already introduced a movie, do NOT re-introduce it. Build on the conversation naturally — respond to what the user just said without restating facts." + movieDataContext;
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
      if (movieContext && last.content.startsWith("Tell me about ")) {
        last.content += `\n[System Context: The user attached the poster for ${movieContext}.]`;
      } else {
        last.content += "\n[User attached an image for analysis — describe and discuss it in the context of movies/TV.]";
      }
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
    if (targetUserId && Array.isArray(parsed.memories) && parsed.memories.length > 0) {
      clientPromise
        .then((client) => {
          const db = client.db("dxbmovies");
          return db.collection("userPreferences").updateOne(
            { userId: targetUserId },
            { $push: { memories: { $each: parsed.memories as string[] } } as any },
            { upsert: true },
          );
        })
        .catch((e) => console.error("Memory save failed", e));
    }

    // Save recommended titles so Sonia never repeats them in future sessions
    if (targetUserId && Array.isArray(parsed.recommendations) && parsed.recommendations.length > 0) {
      clientPromise
        .then((client) => {
          const db = client.db("dxbmovies");
          return db.collection("userPreferences").updateOne(
            { userId: targetUserId },
            { $addToSet: { recommendedTitles: { $each: parsed.recommendations } } as any },
            { upsert: true },
          );
        })
        .catch((e) => console.error("Recommended titles save failed", e));
    }

    // Fetch TMDB movie data for recommended titles
    let movies: Movie[] = [];
    if (tmdbKey && Array.isArray(parsed.recommendations) && parsed.recommendations.length > 0) {
      const results = await Promise.all(
        parsed.recommendations.slice(0, 5).map((title) => searchTMDB(title, tmdbKey, lang)),
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

    let finalMessage = parsed.message;
    if (finalMessage.toLowerCase().includes("i'm not sure") || finalMessage.toLowerCase().includes("i am not sure")) {
      const qs = [
        "What's the last movie you watched that made you cry?",
        "If you could live in any movie universe, which would it be?",
        "Are you more into fast-paced action or slow-burn mysteries?",
        "What's a movie everyone loves but you just couldn't get into?",
        "Do you prefer movies that make you think, or movies that help you turn off your brain?"
      ];
      const q = qs[Math.floor(Math.random() * qs.length)];
      finalMessage = `${finalMessage} To help me get to know your taste better... ${q}`;
    }

    return NextResponse.json({ content: finalMessage, recommendations: movies, provider });
  } catch (err) {
    console.error("[api/chat] All providers failed:", err);
    return NextResponse.json(
      { content: "Sorry, our AI is taking a quick break — please try again in a moment! 🎬", recommendations: [] },
      { status: 200 },
    );
  }
}
