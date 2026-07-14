import { NextResponse } from "next/server";
import type { Movie } from "@/lib/types";
import { getLanguage } from "@/lib/language";
import { enrichWithProviders } from "@/lib/tmdb-helpers";

export const dynamic = "force-dynamic";

const TMDB_BASE = "https://api.themoviedb.org/3";

// Simple PRNG
function seededRandom(seed: number) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

// Genres requested: Action, Romance, Adventure, Sci-Fi, Thriller, Crime, Mysteries
const GENRE_MAP = [
  { name: "Action", movie: 28, tv: 10759 },
  { name: "Romance", movie: 10749, tv: 10749 },
  { name: "Adventure", movie: 12, tv: 10759 },
  { name: "Sci-Fi", movie: 878, tv: 10765 },
  { name: "Thriller", movie: 53, tv: 964 }, // TV doesn't have thriller, mapping to mystery
  { name: "Crime", movie: 80, tv: 80 },
  { name: "Mystery", movie: 964, tv: 964 },
];

export async function GET(request: Request) {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Not configured" }, { status: 500 });

  const lang = getLanguage();
  
  // Calculate week number since epoch (resets every Monday)
  const now = new Date();
  const day = (now.getUTCDay() + 6) % 7; // Monday is 0
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - day);
  monday.setUTCHours(0,0,0,0);
  const weekSeed = Math.floor(monday.getTime() / (1000 * 60 * 60 * 24 * 7));

  const countryCode = request.headers.get("x-vercel-ip-country") || "US";

  // Date strings for current and previous year
  const todayStr = now.toISOString().split("T")[0];
  const currentYear = now.getUTCFullYear();
  const prevYearStartStr = `${currentYear - 1}-01-01`;

  // Fetch 1 item per genre
  const fetches = GENRE_MAP.map(async (genre, index) => {
    // Determine if movie or TV for this genre this week
    const r = seededRandom(weekSeed + index);
    const type = r > 0.5 ? "movie" : "tv";
    const genreId = type === "movie" ? genre.movie : genre.tv;
    
    const params = new URLSearchParams({
      api_key: apiKey,
      language: lang,
      include_adult: "false",
      sort_by: "popularity.desc",
      vote_count_gte: "5",
      with_genres: genreId.toString()
    });

    if (type === "movie") {
      params.append("primary_release_date.gte", prevYearStartStr);
      params.append("primary_release_date.lte", todayStr);
    } else {
      params.append("first_air_date.gte", prevYearStartStr);
      params.append("first_air_date.lte", todayStr);
    }

    try {
      const res = await fetch(`${TMDB_BASE}/discover/${type}?${params.toString()}`, { next: { revalidate: 3600 } });
      if (!res.ok) return null;
      const data = await res.json();
      if (!data.results || data.results.length === 0) return null;

      // Pick a random index from the top 10 based on week seed
      const pickIndex = Math.floor(seededRandom(weekSeed + index * 10) * Math.min(10, data.results.length));
      const item = data.results[pickIndex];
      if (!item) return null;

      // Ensure poster
      if (!item.poster_path) {
          const backup = data.results.find((i: any) => i.poster_path);
          if (!backup) return null;
          Object.assign(item, backup);
      }

      return {
        id: item.id as number,
        title: (item.title ?? item.name ?? "") as string,
        year: ((item.release_date ?? item.first_air_date ?? "") as string).slice(0, 4),
        rating: Math.round(((item.vote_average as number) ?? 0) * 10) / 10,
        posterPath: (item.poster_path as string | null) ?? null,
        backdropPath: (item.backdrop_path as string | null) ?? null,
        overview: (item.overview as string) ?? "",
        genres: [],
        cast: [],
        mediaType: type,
        providers: [],
        rawResult: item, // Stash for enrichment
      };
    } catch {
      return null;
    }
  });

  const rawMovies = (await Promise.all(fetches)).filter(Boolean) as (Movie & { rawResult: any })[];

  // Enrich with providers
  const justRaw = rawMovies.map(m => m.rawResult);
  const enriched = await enrichWithProviders(justRaw, apiKey, countryCode);

  const finalMovies = rawMovies.map((m, i) => {
    m.providers = enriched[i]._providers || [];
    // @ts-ignore
    delete m.rawResult;
    return m;
  });

  // Shuffle final array predictably for the week
  const shuffled = [...finalMovies].sort((a, b) => seededRandom(weekSeed + a.id) - 0.5);

  return NextResponse.json(shuffled);
}
