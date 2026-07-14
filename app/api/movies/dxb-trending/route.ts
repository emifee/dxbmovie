import { NextResponse } from "next/server";
import { enrichWithProviders } from "@/lib/tmdb-helpers";
import type { Movie } from "@/lib/types";

const TMDB_BASE = "https://api.themoviedb.org/3";

// TMDB genre ID → display label
const GENRE_MAP: Record<number, string> = {
  28: "Action",
  12: "Adventure",
  16: "Animation",
  35: "Comedy",
  80: "Crime",
  99: "Documentary",
  18: "Drama",
  10751: "Family",
  14: "Fantasy",
  36: "History",
  27: "Horror",
  10402: "Music",
  9648: "Mystery",
  10749: "Romance",
  878: "Sci-Fi",
  53: "Thriller",
  10752: "War",
  37: "Western",
  10770: "TV Movie",
};

export const dynamic = "force-dynamic";

export async function GET() {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "TMDB_API_KEY not configured" }, { status: 500 });
  }

  try {
    const res = await fetch(`${TMDB_BASE}/trending/all/week?api_key=${apiKey}&language=en-US`);
    if (!res.ok) {
      throw new Error(`TMDB error: ${res.status}`);
    }

    const data = await res.json();
    
    // Top 15
    const results = data.results.slice(0, 15);

    const movies: Movie[] = results.map((m: any) => {
      const releaseDate = (m.release_date ?? m.first_air_date ?? "") as string;
      return {
        id: m.id,
        title: (m.title ?? m.name ?? "Untitled") as string,
        year: releaseDate.slice(0, 4),
        rating: Math.round(((m.vote_average as number) ?? 0) * 10) / 10,
        posterPath: (m.poster_path as string | null) ?? null,
        backdropPath: (m.backdrop_path as string | null) ?? null,
        overview: (m.overview as string) ?? "",
        genres: ((m.genre_ids as number[]) ?? [])
          .map((id) => GENRE_MAP[id])
          .filter(Boolean) as string[],
        cast: [],
        mediaType: (m.media_type as "movie" | "tv") || "movie",
      };
    });

    const enriched = await enrichWithProviders(movies, apiKey);
    return NextResponse.json(enriched);
  } catch (err) {
    console.error("[dxb-trending GET]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
