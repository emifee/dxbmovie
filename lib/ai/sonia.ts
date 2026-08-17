import clientPromise from "@/lib/mongodb";
import { routeChat, type AIChatMessage, type RouterResult } from "@/lib/ai-router";
import type { Movie } from "@/lib/types";
import { getCommerceSession } from "@/lib/db/commerce-sessions";
import { executeCommerceTool } from "@/lib/commerce/tools";
import { getActiveOrderForCustomer } from "@/lib/db/commerce-orders";

const TMDB_BASE = "https://api.themoviedb.org/3";

function isPosterRequest(text: string): boolean {
  const t = text.toLowerCase();
  return t.includes("show me the poster") || 
         t.includes("can i see the poster") || 
         t.includes("show me the image") || 
         t.includes("can i see it") || 
         t.includes("show me a picture");
}

export type Channel = "web" | "instagram_dm" | "instagram_comment";

export interface SoniaRequest {
  channel: Channel;
  userId?: string | null;
  anonId?: string | null;
  messageHistory: AIChatMessage[]; // Should include the latest user message
  movieContext?: string;
  attachedTitle?: string | null;
  lang?: string;
  commerceSessionId?: string;
}

export interface SoniaResponse {
  content: string;
  recommendations: Movie[];
  provider: string;
  intent?: string;
  presentation?: any;
}

const BASE_SYSTEM_PROMPT = `You are Sonia, the AI companion of DXBmovies (dxbmovie.online) — a smart, passionate, and incredibly human movie companion. You sound like a real film-buff friend, not a robot.

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

TMDB COUNTRY CATEGORIZATION RULE: If a user asks why an American movie like "Terminator 2" or an English movie like "The Fifth Element" is listed under France or another country, explain that TMDB categorizes movies strictly by the origin of their production companies. T2 had major funding from Canal+ (France), making it a French co-production legally. The Fifth Element was entirely funded by Gaumont (France). Use this as a fun trivia fact!

HUMAN CONVERSATION RULE: Sound natural! Express your own opinions ("I absolutely loved this one", "Honestly, it's a bit slow but worth it"). Don't just list movies — chat about them.

ALWAYS reply with valid JSON and nothing else — no markdown, no code fences.
You must use the abstract "presentation" object when you want to send rich media (like an image, quick replies, a movie card, or a commerce card).
The backend will render this into the correct format for Instagram, Web, or Telegram.

**IMPORTANT MEDIA RULE**: NEVER claim you are a "text-based AI" or say you cannot send images. You absolutely CAN send images by using the presentation layer.

JSON SCHEMA:
{
  "intent": "MOVIE_DISCUSSION",
  "message": "Your conversational text reply here.",
  "recommendations": ["Title 1"],
  "memories": ["Fact 1"],
  "presentation": {
    // Only one of the following schemas:
    
    // Schema 1: Image
    "type": "image",
    "deliveryMode": "text_only" | "media_only" | "text_then_media" | "embedded",
    "movieId": "12345", // optional
    "tmdbId": 12345, // optional
    "mediaType": "movie" | "tv", // optional
    "mediaId": "abcd", // optional
    
    // Schema 2: Movie Card
    // "type": "movie_card",
    // "tmdbId": 12345,
    // "mediaType": "movie" | "tv",
    // "actions": ["more_details" | "similar_movies"]
    // "deliveryMode": "text_only" | "media_only" | "text_then_media" | "embedded",
    
    // Schema 3: Commerce Card
    // "type": "commerce_card",
    // "commerceProductId": "123",
    // "orderId": "456",
    // "action": "view_product" | "pay",
    // "deliveryMode": "text_only" | "media_only" | "text_then_media" | "embedded",
    
    // Schema 4: Quick Replies
    // "type": "quick_replies",
    // "options": [{ "label": "Yes", "payload": "YES" }]
    // "deliveryMode": "text_only" | "media_only" | "text_then_media" | "embedded",
  }
}

**DELIVERY MODE RULE**: You decide how the text "message" interacts with the "presentation". 
- "embedded": Try to place the text directly inside the card/image caption, avoiding a duplicate standalone text message. Best for commerce/movie cards.
- "text_then_media": Send the text message separately before the media.
- "media_only": Send only the media (ignores "message" field).

When NOT recommending titles or sending media, omit "presentation" or leave empty:
{"intent":"MOVIE_DISCUSSION","message":"Your reply here","recommendations":[],"memories":[]}

ORDER INFORMATION EXTRACTION:
If the user provides information to fulfill an active order (like their address, phone number, size, color, or quantity), you must extract it into an "extractedOrderFields" object alongside your message:
{"intent":"PRODUCT_SELECTION","message":"Got it! What about the color?","extractedOrderFields":{"quantity":2,"shippingAddress":{"line1":"123 Fake St","city":"Dubai"}}}
Only extract fields the user actually provided. For shipping address, try to structure it with line1, city, country, etc. if provided, otherwise put the raw text in line1.

INTENT CLASSIFICATION:
You must determine the user's current intent in the "intent" field.
- "MOVIE_DISCUSSION": General movie/TV chat.
- "PRODUCT_DISCOVERY": User asks about an item from a movie (e.g. "What sunglasses is Neo wearing?").
- "PRODUCT_SEARCH": User wants something specific or sets a budget (e.g. "I want a cheap Iron Man helmet").
- "PRODUCT_SELECTION": User selects a product from choices provided.
- "CHECKOUT_INTENT": User is asking how to buy or where to pay.

COMMERCE TOOLS (Anti-Hallucination):
If the user's intent is PRODUCT_DISCOVERY, PRODUCT_SEARCH, or PRODUCT_SELECTION, you MUST NOT invent prices, stock, shipping times, or availability. You MUST use commerce tools.
Instead of "message", output ONLY the action JSON:
{"intent":"PRODUCT_SEARCH","action":"search_catalog","query":"sunglasses"}
{"intent":"PRODUCT_SELECTION","action":"get_supplier_offers","commerceProductId":"123"}
If the user reaches CHECKOUT_INTENT, do NOT say "checkout module coming soon". Reply neutrally: "Purchasing is not currently enabled for this item, but I've noted your interest!"

DM TRANSITION (For Instagram Comments only):
If you are replying in a public Instagram Comment ("channel": "instagram_comment") and the intent is Commerce-related, DO NOT conduct a long product search publicly. Acknowledge it briefly and DO NOT say "I sent you a DM" (we cannot send unsolicited DMs yet). Say something like: "I have some great options for that, I'll keep an eye out for a DM from you!"

MEMORY EXTRACTION RULE: In the "memories" array, extract any specific facts about the user's movie/TV preferences from their LATEST message. Keep facts concise (e.g., "Loved Interstellar", "Hates horror"). If nothing to extract, use [].

RECOMMENDATION RULE: When user asks for suggestions, populate "recommendations" with up to 5 titles and explain in your message WHY you picked each one. Never just list titles without context.

NEVER REPEAT RECOMMENDATIONS: You have a list of titles you have already recommended to this user in past sessions (injected in their profile below as "Already Recommended"). NEVER suggest any title from that list again — pick fresh alternatives every single time.

WHEN USER REJECTS ALL SUGGESTIONS: If the user says "I don't like any of these" or "I've seen all of these" or similar, FIRST ask them warmly: "Oh interesting! Have you actually watched all of them, or do they just not sound appealing to you?" — then based on their answer, either find truly new alternatives (if watched) or dig deeper into WHY they don't like the premise (if not watched).

Rules: only real films/shows, 5 titles max when suggesting, stay on topic.
NEVER REPEAT RULE: NEVER repeat information you already said in a previous message. If you already introduced a movie, do NOT re-introduce it. Build on the conversation naturally — respond to what the user just said without restating facts.`;

const WEB_POLICY = `
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

ACTIVE ENGAGEMENT RULE: Always keep the conversation going. Ask a follow-up question at the end of every response.

VOICE RULE: If user asks for a voice note, say: "Of course! Just click the small speaker icon below this message and I'll read it out loud for you."

POSTER RULE: Whenever user asks to see a poster or image for any movie/show, ALWAYS use the "presentation" object in your JSON output with {"type": "image", "movieId": "<TMDB_ID>"}. Never hallucinate raw image URLs, and NEVER say you are a text-based AI.

PROACTIVE FOLLOW-UP: If you notice the user is starting a new conversation and there are titles in their "Already Recommended" list, you MUST proactively ask them if they ended up watching any of them! Example: "Hey there! Last time we spoke, I recommended The Matrix and Inception. Did you get a chance to watch either of them?"
`;

const IG_DM_POLICY = `
CHANNEL CONTEXT: You are chatting with the user in an Instagram Direct Message.
- Keep responses extremely natural, concise, and calm. Do not sound like an over-excited AI assistant.
- Default DM responses should normally be 1–3 short sentences.
- When a user asks for a single recommendation, give exactly ONE recommendation. Do not dump 5 recommendations unless explicitly asked for multiple.
- Avoid repetitive phrases like "I've got just the thing!", "No worries!", or excessive praise/hype. Match the user's conversational energy.
- DO NOT reference website UI elements (like bottom navigation bars, profile icons, etc) as the user is on Instagram, not the website.
- You should understand follow-up messages based on conversation history.
- Do NOT artificially prolong conversations.
- Do NOT repeatedly ask follow-up questions when the user's request has already been answered or the conversation naturally concludes.
`;

const IG_COMMENT_POLICY = `
CHANNEL CONTEXT: You are replying publicly to a user's comment on an Instagram post.

1. INTENT CLASSIFICATION
Before generating a response, internally classify the comment's intent as one of the following:
- question
- opinion/reaction
- movie identification request
- recommendation request
- product/commerce intent
- abusive
- spam / emoji-only / irrelevant

2. IGNORE POLICY
If the comment is "spam", "abusive", "emoji-only", or "irrelevant" to movies/our post context — DO NOT REPLY. To ignore a comment, return exactly an empty string for the "message" field in your JSON output: {"message": ""}

3. COMMERCE POLICY
For "product/commerce intent", classify it now but do NOT invent prices, stock, products, payment status, or commerce actions. Commerce tools are not implemented yet. Keep it neutral and only reply if you have reliable context.

4. REPLY POLICY
If the comment warrants a reply:
- PUBLIC RESPONSE MODE: Reply with exactly ONE natural, short sentence.
- NO FOLLOW-UP QUESTIONS: Do NOT ask a follow-up question merely to continue engagement. Respond to what the person said and then stop.
- NO ESSAYS: Keep it extremely brief and contextual to the post.
- Avoid repetitive canned responses.
- Recommendations should be mentioned directly in the text if asked, as there are no visual UI "cards" in Instagram comments.
`;

function getChannelPolicy(channel: Channel): string {
  switch (channel) {
    case "web": return WEB_POLICY;
    case "instagram_dm": return IG_DM_POLICY;
    case "instagram_comment": return IG_COMMENT_POLICY;
    default: return "";
  }
}

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

      const cast = (tv.credits?.cast || []).slice(0, 8).map((c: any) => `${c.name} as ${c.character}`).join(", ");
      const directors = (tv.credits?.crew || []).filter((c: any) => c.job === "Director" || c.department === "Directing").slice(0, 3).map((c: any) => c.name).join(", ");
      const creators = (tv.created_by || []).map((c: any) => c.name).join(", ");
      const genres = (tv.genres || []).map((g: any) => g.name).join(", ");
      const keywords = (tv.keywords?.results || []).slice(0, 10).map((k: any) => k.name).join(", ");
      const networks = (tv.networks || []).map((n: any) => n.name).join(", ");

      return `[REAL-TIME TMDB DATA] TV Show: ${tv.name}. First aired: ${tv.first_air_date}. Last aired: ${tv.last_air_date || "ongoing"}. Seasons: ${tv.number_of_seasons}. Episodes: ${tv.number_of_episodes}. Status: ${tv.status}. Rating: ${tv.vote_average}/10 (${tv.vote_count} votes). Genres: ${genres}. Networks: ${networks}. Created by: ${creators || "N/A"}. Cast: ${cast || "N/A"}. Directors: ${directors || "N/A"}. Languages: ${(tv.spoken_languages || []).map((l: any) => l.english_name).join(", ")}. Origin Country: ${(tv.origin_country || []).join(", ")}. Tagline: ${tv.tagline || "N/A"}. Overview: ${tv.overview}. Keywords: ${keywords || "N/A"}.${providerLines.length > 0 ? "\nWhere to watch:\n" + providerLines.join("\n") : "\nStreaming availability: Not found on TMDB for AE/SA/US/GB."}${tv.external_ids?.imdb_id ? `. IMDB: ${tv.external_ids.imdb_id}` : ""}`;
    } else {
      const mRes = await fetch(`${TMDB_BASE}/movie/${hit.id}?api_key=${apiKey}&append_to_response=${appendFields}`);
      if (!mRes.ok) return `Movie: ${hit.title}. Release: ${hit.release_date}. Overview: ${hit.overview}`;
      const m = await mRes.json();

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

      const cast = (m.credits?.cast || []).slice(0, 8).map((c: any) => `${c.name} as ${c.character}`).join(", ");
      const directors = (m.credits?.crew || []).filter((c: any) => c.job === "Director").slice(0, 3).map((c: any) => c.name).join(", ");
      const writers = (m.credits?.crew || []).filter((c: any) => c.job === "Screenplay" || c.job === "Writer").slice(0, 3).map((c: any) => c.name).join(", ");
      const genres = (m.genres || []).map((g: any) => g.name).join(", ");
      const keywords = (m.keywords?.keywords || []).slice(0, 10).map((k: any) => k.name).join(", ");
      const aeRating = (m.release_dates?.results || []).find((r: any) => r.iso_3166_1 === "AE" || r.iso_3166_1 === "US");
      const certification = aeRating?.release_dates?.[0]?.certification || "N/A";
      const prodCompanies = (m.production_companies || []).slice(0, 3).map((c: any) => c.name).join(", ");

      return `[REAL-TIME TMDB DATA] Movie: ${m.title}. Release: ${m.release_date}. Runtime: ${m.runtime} mins. Status: ${m.status}. Rating: ${m.vote_average}/10 (${m.vote_count} votes). Age Rating: ${certification}. Genres: ${genres}. Director: ${directors || "N/A"}. Writers: ${writers || "N/A"}. Cast: ${cast || "N/A"}. Budget: $${(m.budget || 0).toLocaleString()}. Box Office: $${(m.revenue || 0).toLocaleString()}. Production: ${prodCompanies || "N/A"}. Languages: ${(m.spoken_languages || []).map((l: any) => l.english_name).join(", ")}. Origin Country: ${(m.origin_country || []).join(", ")}. Tagline: ${m.tagline || "N/A"}. Overview: ${m.overview}. Keywords: ${keywords || "N/A"}.${providerLines.length > 0 ? "\nWhere to watch:\n" + providerLines.join("\n") : "\nStreaming availability: Not found on TMDB for AE/SA/US/GB."}${m.external_ids?.imdb_id ? `. IMDB: ${m.external_ids.imdb_id}` : ""}`;
    }
  } catch {
    return "Search failed.";
  }
}

// Removed buildOrderResponse as UX is now handled dynamically by the LLM

export async function generateSoniaResponse(req: SoniaRequest): Promise<SoniaResponse> {
  const tmdbKey = process.env.TMDB_API_KEY;
  const targetUserId = req.userId || req.anonId;
  const lang = req.lang || "en";
  let userContextStr = "";
  let commerceContextStr = "";
  let activeMediaContext: any = null;

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

      const likedGenres: string[] = reactions
        .filter((r: any) => r.reaction === "like" && Array.isArray(r.movieGenres))
        .flatMap((r: any) => r.movieGenres as string[]);
      const dislikedGenres: string[] = reactions
        .filter((r: any) => r.reaction === "dislike" && Array.isArray(r.movieGenres))
        .flatMap((r: any) => r.movieGenres as string[]);

      const recommendedTitles: string[] = prefs?.recommendedTitles || [];
      activeMediaContext = prefs?.activeMediaContext || null;

      userContextStr = "\n\nUSER PROFILE:\n";
      // We don't have userName here unless we pass it in, we'll keep it simple for now or let the caller prefix it in a message if needed.
      if (genres.length > 0) userContextStr += `- Favourite Genres (DNA): ${genres.join(", ")}\n`;
      if (likedGenres.length > 0) {
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
      console.error("[ai/sonia] Failed to fetch user context", e);
    }
  }

  if (req.lang) {
    userContextStr += `\n\nLANGUAGE ENFORCEMENT: The user's preferred language is "${req.lang}". You MUST reply in this language.`;
  }

  commerceContextStr = "";
  if (req.commerceSessionId) {
    const session = await getCommerceSession(req.commerceSessionId);
    if (session) {
      commerceContextStr = `\n\nCOMMERCE SESSION STATE:
- Current Intent: ${session.currentIntent}
- Candidate Products (IDs you have shown them): ${session.candidateProductIds.length ? session.candidateProductIds.join(", ") : "None yet"}
- Selected Product ID: ${session.selectedProductId || "None"}
- Checkout Ready: ${session.checkoutReady}
Use this context to understand which product the user is referring to when they say things like "the second one" or "I'll take it".
When you use commerce tools, provide the precise Commerce Product ID from this context.`;
    }
  }

  // Active Order Context
  if (targetUserId) {
    const activeOrder = await getActiveOrderForCustomer(targetUserId);
    if (activeOrder) {
      // Build product-aware context
      let productContext = "";
      let selectableInfo = "";
      let fixedInfo = "";
      
      if (activeOrder.commerceProductId) {
        try {
          const { getCommerceProduct } = await import("@/lib/db/commerce-products");
          const product = await getCommerceProduct(activeOrder.commerceProductId);
          if (product?.purchaseRequirements) {
            const pr = product.purchaseRequirements;
            
            if (pr.fixedAttributes && Object.keys(pr.fixedAttributes).length > 0) {
              fixedInfo = `\nFIXED ATTRIBUTES (already determined by the product — do NOT ask the customer about these):\n`;
              for (const [key, val] of Object.entries(pr.fixedAttributes)) {
                fixedInfo += `  - ${key}: ${val}\n`;
              }
            }
            
            if (pr.selectableAttributes && Object.keys(pr.selectableAttributes).length > 0) {
              selectableInfo = `\nSELECTABLE ATTRIBUTES (present these options to the customer when asking):\n`;
              for (const [key, options] of Object.entries(pr.selectableAttributes)) {
                selectableInfo += `  - ${key}: ${options.join(", ")}\n`;
              }
            }
          }
        } catch (e) {
          console.error("[ai/sonia] Failed to load product requirements for prompt", e);
        }
      }

      // Handle PRICE_CHANGE_CUSTOMER_APPROVAL_REQUIRED state
      if (activeOrder.status === 'PRICE_CHANGE_CUSTOMER_APPROVAL_REQUIRED') {
        commerceContextStr += `\n\nACTIVE ORDER — PRICE CHANGE APPROVAL REQUIRED:
You are waiting for the customer to approve a price change.

- Order ID: ${activeOrder._id}
- Product: ${activeOrder.displayed_product_title}
- Original Price: ${activeOrder.originalCustomerPrice}
- New Proposed Price: ${activeOrder.proposedNewPrice}

Explain to the customer naturally that the original seller's stock has changed, and the updated price is now ${activeOrder.proposedNewPrice}. Do NOT use exact internal terminology. Say something like:
"Hey, just a heads up — the original listing for this item has been updated. The best available price I can get you now is [proposedNewPrice]. Would you still like to go ahead?"

If the customer says yes, extract: {"extractedOrderFields": {"priceApproved": true}}
If the customer says no or wants to cancel, extract: {"extractedOrderFields": {"priceApproved": false}}

Do NOT proceed to any other topic until the customer responds.`;
      } else {
        // Standard order collection mode
        commerceContextStr += `\n\nIf there is an active order, you are in ORDER COLLECTION MODE.
Your primary job is to collect the required fields from the user.

CRITICAL RULES:
1. Do NOT infer which fields have been collected from the conversation history. The ONLY source of truth for missing fields is the list provided below.
2. You MUST ask for the EXACT field requested below, even if you think the user already provided it (they may have provided it in an invalid format, so you must ask again).
3. Ask for ONLY ONE field at a time.
4. Keep your responses extremely natural, brief, and conversational.
5. NEVER use robotic synonym rotations (like "Got it", "Perfect", "Great"). Instead, vary your approach. Sometimes acknowledge context ("Green and white works. How many pairs should I put down?"), sometimes just ask directly ("How many pairs would you like?"), and sometimes acknowledge briefly ("Perfect — how many pairs?").

QUANTITY VALIDATION:
- When asking for quantity, you MUST get an actual number from the customer.
- If the customer responds with "yes", "sure", "okay", "yeah", or any non-numeric answer when you ask about quantity, do NOT extract it as 1 or any number.
- Instead, ask again clearly: "How many would you like? Just give me the number."
- ONLY extract quantity when the customer provides an explicit number (like "1", "2", "one", "two", etc).

ACTIVE ORDER STATE:
- Internal Order ID: ${activeOrder._id}
- Instagram Customer IGSID: ${activeOrder.customer_igsid}
- Native Message ID: ${activeOrder.native_message_id}
- Displayed Product Title: ${activeOrder.displayed_product_title}
- Category: ${activeOrder.productCategory || 'unknown'}
- Order Status: ${activeOrder.status}
- Missing Fields: ${activeOrder.missingFields?.join(', ') || 'None'}
${fixedInfo}${selectableInfo}
If the status is INFORMATION_REQUIRED, you must ask the user for the NEXT required field.
The very next field you should ask for is: **${activeOrder.missingFields?.[0] || 'None'}**

When asking for a selectable attribute, present the available options naturally. For example: "What color would you like? I have Black, Silver, and Gold available."

If the user provides information, extract it into the "extractedOrderFields" JSON object.
Do not decide if the order is complete or valid; the backend will validate the fields you extract and update the list of missing fields.`;
      }
    }
  }

  let movieDataContext = "";
  if (req.movieContext && tmdbKey) {
    const userMsgCount = req.messageHistory.filter((m) => m.role === "user").length;
    if (userMsgCount <= 1) {
      try {
        const tmdbData = await fetchTMDBDataForAI(req.movieContext, tmdbKey);
        movieDataContext = `\n\nThe user opened this conversation from the movie page for: "${req.movieContext}". Here is real-time data about this title:\n${tmdbData}\n\nUse this data to answer any questions about this movie/show. You already have all the data — do NOT trigger a search action for this title. Start by talking about it naturally.`;
      } catch {
        movieDataContext = `\n\nThe user opened this conversation from the movie page for: "${req.movieContext}". Start by talking about that movie.`;
      }
    }
  }

  const channelPolicy = getChannelPolicy(req.channel);
  
  let systemContent = BASE_SYSTEM_PROMPT + "\n\n" + channelPolicy + movieDataContext + userContextStr + commerceContextStr;

  const chatMessages: AIChatMessage[] = [{ role: "system", content: systemContent }];

  for (const m of req.messageHistory) {
    if (m.role === "user" || m.role === "assistant") {
      chatMessages.push({ role: m.role, content: m.content });
    }
  }

  if (req.attachedTitle && chatMessages.length > 0) {
    const last = chatMessages[chatMessages.length - 1];
    if (last.role === "user") {
      last.content += `\n[System Context: The user attached the poster for "${req.attachedTitle}". Discuss that title. Do not say you cannot see images.]`;
    }
  }

  let text = "";
  let provider = "unknown";
  let parsed: { 
    intent?: string; 
    message: string; 
    recommendations: string[]; 
    memories?: string[]; 
    action?: string; 
    query?: string; 
    maxPrice?: number; 
    category?: string; 
    commerceProductId?: string;
    extractedOrderFields?: any;
    presentation?: any;
  } = { message: "", recommendations: [] };
  let wantsTmdbSearch = false;
  let wantsCommerceAction = false;
  let hasExtractedFields = false;

  try {
    const routerResult = await routeChat(chatMessages);
    text = routerResult.text;
    provider = routerResult.provider;

    try {
      const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
      const start = stripped.indexOf("{");
      const end = stripped.lastIndexOf("}");
      if (start !== -1 && end !== -1) {
        const cleaned = stripped.slice(start, end + 1);
        parsed = JSON.parse(cleaned);
        if (parsed.action === "search" && parsed.query) {
          wantsTmdbSearch = true;
        } else if (parsed.action === "search_catalog" || parsed.action === "get_supplier_offers") {
          wantsCommerceAction = true;
        }
        if (parsed.extractedOrderFields && Object.keys(parsed.extractedOrderFields).length > 0) {
          hasExtractedFields = true;
        }
      }
    } catch {
      // Ignored for fallback
    }

    // Two-pass TMDB search
    if (wantsTmdbSearch && parsed.query && tmdbKey) {
      console.log(`[ai/sonia] AI requested real-time TMDB search for: ${parsed.query}`);
      const searchResult = await fetchTMDBDataForAI(parsed.query, tmdbKey);
      
      chatMessages.push({ role: "assistant", content: text });
      chatMessages.push({ 
        role: "user", 
        content: `${searchResult}\n\nNow provide the final response to my original question using this real-time data. Remember to output ONLY valid JSON format: {"intent":"MOVIE_DISCUSSION", "message": "...", "recommendations": [], "memories": []}` 
      });

      const secondPass = await routeChat(chatMessages);
      text = secondPass.text;
      
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
    } else if (wantsCommerceAction) {
      console.log(`[ai/sonia] AI requested Commerce Tool: ${parsed.action}`);
      const args = { query: parsed.query, maxPrice: parsed.maxPrice, category: parsed.category, commerceProductId: parsed.commerceProductId };
      const toolResult = await executeCommerceTool(parsed.action!, args);
      
      chatMessages.push({ role: "assistant", content: text });
      chatMessages.push({ 
        role: "user", 
        content: `TOOL OUTPUT:\n${JSON.stringify(toolResult, null, 2)}\n\nNow provide the final response to my original request using this tool output. Remember to output ONLY valid JSON format: {"intent":"PRODUCT_DISCOVERY", "message": "...", "recommendations": [], "memories": []}` 
      });

      const secondPass = await routeChat(chatMessages);
      text = secondPass.text;
      
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
    } else if (!parsed.message && !wantsTmdbSearch && !wantsCommerceAction) {
      parsed = { message: text, recommendations: [], memories: [], extractedOrderFields: parsed.extractedOrderFields };
    }

    if (hasExtractedFields && targetUserId) {
      try {
        const { updateOrderCollectedInfo, runOrderOrchestrator, getActiveOrderForCustomer, updateOrderStatus } = await import("@/lib/db/commerce-orders");
        const { validateField } = await import("@/lib/commerce/orchestrator");
        const activeOrder = await getActiveOrderForCustomer(targetUserId);
        
        if (activeOrder) {
          // Handle price approval for repricing flow
          if (parsed.extractedOrderFields?.priceApproved !== undefined && activeOrder.status === 'PRICE_CHANGE_CUSTOMER_APPROVAL_REQUIRED') {
            if (parsed.extractedOrderFields.priceApproved === true) {
              console.log(`[ai/sonia] Customer approved repriced order ${activeOrder._id}`);
              const { appendSourcingEvent } = await import("@/lib/db/commerce-orders");
              await appendSourcingEvent(activeOrder._id!.toString(), "CUSTOMER_ACCEPTED_REPRICE", {
                proposedPrice: activeOrder.proposedNewPrice,
                proposedCurrency: activeOrder.proposedCurrency,
                repricingVersion: activeOrder.repricingVersion,
                originalCustomerPrice: activeOrder.originalCustomerPrice,
              });
              await updateOrderStatus(activeOrder._id!.toString(), "READY_FOR_PAYMENT");
              // Second pass for confirmation message
              chatMessages.push({ role: "assistant", content: text });
              chatMessages.push({ role: "user", content: `[SYSTEM] The customer has approved the new price. The order is now READY_FOR_PAYMENT. Confirm to the customer that their order is being processed at the new price. Be warm and reassuring. Remember to output ONLY valid JSON.` });
              const confirmPass = await routeChat(chatMessages);
              text = confirmPass.text;
              try {
                const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
                const start = stripped.indexOf("{");
                const end = stripped.lastIndexOf("}");
                if (start !== -1 && end !== -1) parsed = JSON.parse(stripped.slice(start, end + 1));
              } catch { parsed.message = text; }
            } else {
              console.log(`[ai/sonia] Customer rejected repriced order ${activeOrder._id}`);
              const { appendSourcingEvent } = await import("@/lib/db/commerce-orders");
              await appendSourcingEvent(activeOrder._id!.toString(), "CUSTOMER_REJECTED_REPRICE", {
                proposedPrice: activeOrder.proposedNewPrice,
                proposedCurrency: activeOrder.proposedCurrency,
                repricingVersion: activeOrder.repricingVersion,
              });
              await updateOrderStatus(activeOrder._id!.toString(), "PRICE_REVIEW_REQUIRED");
            }
            // Skip normal field processing for price approval
          } else {
            // Normal field extraction flow
            const validatedFields: any = {};
            const invalidReasons: string[] = [];

            for (const [key, value] of Object.entries(parsed.extractedOrderFields || {})) {
              if (value === undefined || value === null || value === "") continue;
              if (key === "priceApproved") continue; // handled above
              
              const validation = validateField(key, value);
              if (validation.valid) {
                validatedFields[key] = value;
              } else {
                invalidReasons.push(`Field ${key} was invalid: ${validation.reason}`);
              }
            }

            if (Object.keys(validatedFields).length > 0) {
              console.log(`[ai/sonia] Saving validated order fields: `, validatedFields);
              await updateOrderCollectedInfo(activeOrder._id!.toString(), validatedFields);
              await runOrderOrchestrator(activeOrder._id!.toString());
              
              // Reload FRESH order state and do a second pass so Sonia can ask dynamically
              const freshOrder = await getActiveOrderForCustomer(targetUserId);
              if (freshOrder) {
                let systemPromptAddon = "";
                if (freshOrder.status === 'READY_FOR_SOURCING_CHECK') {
                  systemPromptAddon = `[SYSTEM] The extracted fields were validated and saved. The order is now complete — all information has been collected! (Status: READY_FOR_SOURCING_CHECK). Tell the customer: "Thanks — I have everything I need. I'm checking availability now." The sourcing check is running in the background. Do not ask for any more information. Do NOT say "Order confirmed". Remember to output ONLY valid JSON.`;
                } else if (freshOrder.status === 'PREFLIGHT_TEST_PASSED') {
                  systemPromptAddon = `[SYSTEM] The order is currently in PREFLIGHT_TEST_PASSED state. A live supplier verification is required by a human admin before payment can be authorized. If the customer is asking for an update, tell them gracefully: "I'm still checking with our suppliers to confirm availability and price. I'll get back to you shortly!" Do NOT say the order is confirmed yet. Remember to output ONLY valid JSON.`;
                } else if (freshOrder.status === 'READY_FOR_PAYMENT') {
                  systemPromptAddon = `[SYSTEM] The extracted fields were validated and saved. The order is ready for payment! (Status: ${freshOrder.status}). Acknowledge that the order details are confirmed and you have everything you need. Do not ask for any more information. Remember to output ONLY valid JSON.`;
                } else if (freshOrder.missingFields && freshOrder.missingFields.length > 0) {
                  const nextField = freshOrder.missingFields[0];
                  systemPromptAddon = `[SYSTEM] The extracted fields were validated and saved. The very next field you must ask for is: **${nextField}**. Naturally weave this question into the conversation. Sometimes acknowledge briefly, sometimes jump straight into the question, sometimes reference context. Do not be robotic. Remember to output ONLY valid JSON.`;
                }

                if (systemPromptAddon) {
                  console.log(`[ai/sonia] Running second pass for dynamic order response...`);
                  chatMessages.push({ role: "assistant", content: text });
                  chatMessages.push({ role: "user", content: systemPromptAddon });
                  
                  const secondPass = await routeChat(chatMessages);
                  text = secondPass.text;
                  
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
                    parsed.message = text; // fallback
                  }
                }
              }
            }

            if (invalidReasons.length > 0) {
              console.warn(`[ai/sonia] User provided invalid order info: `, invalidReasons);
            }
          }
        }
      } catch (e) {
        console.error("[ai/sonia] Failed to process extracted fields", e);
      }
    }

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
        .catch((e) => console.error("[ai/sonia] Memory save failed", e));
    }

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
        .catch((e) => console.error("[ai/sonia] Recommended titles save failed", e));
    }

    let movies: Movie[] = [];
    if (tmdbKey && Array.isArray(parsed.recommendations) && parsed.recommendations.length > 0) {
      const results = await Promise.all(
        parsed.recommendations.slice(0, 5).map((title) => searchTMDB(title, tmdbKey, req.lang)),
      );
      movies = results.filter((m): m is Movie => m !== null);

      if (movies.length > 0 && targetUserId) {
        const primary = movies[0];
        
        // Update local context for this turn's rendering
        activeMediaContext = {
          title: primary.title,
          tmdbId: primary.id,
          mediaType: primary.mediaType,
          source: "sonia_recommendation",
          setAt: new Date().toISOString()
        };

        clientPromise.then(client => {
          client.db("dxbmovies").collection("userPreferences").updateOne(
            { userId: targetUserId },
            { $set: { activeMediaContext } }
          );
        }).catch(e => console.error("[ai/sonia] activeMediaContext save failed", e));
      }
    }

    let finalMessage = parsed.message;
    // Follow-up question fallback (only for web channel, as per policies)
    if (req.channel === "web" && (finalMessage.toLowerCase().includes("i'm not sure") || finalMessage.toLowerCase().includes("i am not sure"))) {
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

    // Deterministic Poster-Intent Safeguard
    const userText = chatMessages.filter((m) => m.role === "user").pop()?.content || "";
    const posterIntentDetected = isPosterRequest(userText);
    let fallbackTriggered = false;

    if (parsed.presentation && (parsed.presentation.type === "image" || parsed.presentation.type === "movie_card")) {
      if (activeMediaContext) {
        // ALWAYS trust our backend TMDB search over the LLM's hallucinated TMDB ID
        parsed.presentation.tmdbId = activeMediaContext.tmdbId;
        parsed.presentation.mediaType = parsed.presentation.mediaType || activeMediaContext.mediaType;
      }
    }

    if (
      !parsed.presentation &&
      userText &&
      posterIntentDetected &&
      activeMediaContext
    ) {
      fallbackTriggered = true;
      parsed.presentation = {
        type: "image",
        tmdbId: activeMediaContext.tmdbId,
        mediaType: activeMediaContext.mediaType,
        deliveryMode: "text_then_media"
      };
      
      // Enforce clean fallback message
      if (
        finalMessage.toLowerCase().includes("text-based ai") ||
        finalMessage.toLowerCase().includes("can't share images") ||
        finalMessage.toLowerCase().includes("cannot share images") ||
        finalMessage.toLowerCase().includes("the poster features") ||
        !finalMessage.trim() || 
        finalMessage.length > 100
      ) {
        finalMessage = "Here it is 👇";
      }
    }

    if (posterIntentDetected || parsed.presentation?.type === "image" || parsed.presentation?.type === "movie_card") {
      console.log(`\n=== SONIA POSTER TRACE ===\n` + JSON.stringify({
        userText,
        activeRecommendedTitle: activeMediaContext?.title,
        rawModelOutput: text,
        parsedPresentation: parsed.presentation,
        posterIntentDetected,
        fallbackTriggered,
        resolvedTmdbId: parsed.presentation?.tmdbId,
        resolvedMediaType: parsed.presentation?.mediaType,
      }, null, 2) + `\n==========================\n`);
    }

    return {
      content: finalMessage,
      recommendations: movies,
      provider,
      intent: parsed.intent,
      presentation: parsed.presentation,
    };
  } catch (err) {
    console.error("[ai/sonia] All providers failed:", err);
    return { content: "Sorry, our AI is taking a quick break — please try again in a moment! 🎬", recommendations: [], provider: "error" };
  }
}
