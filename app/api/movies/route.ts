import { NextResponse } from "next/server";
import type { Movie } from "@/lib/types";
import { STREAMING_SERVICES } from "@/lib/constants";

const TMDB_BASE = "https://api.themoviedb.org/3";

// TMDB genre ID → display label (matches lib/constants.ts GENRES)
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

function mapMovie(m: Record<string, unknown>): Movie {
  const releaseDate = (m.release_date ?? m.first_air_date ?? "") as string;
  return {
    id: m.id as number,
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
    mediaType: "movie",
  };
}

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const genre = searchParams.get("genre"); // TMDB genre ID or 'all'
  const provider = searchParams.get("provider"); // provider slug from STREAMING_SERVICES
  const page = searchParams.get("page") ?? "1";

  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "TMDB_API_KEY not configured" }, { status: 500 });
  }

  const providerId = provider
    ? STREAMING_SERVICES.find((service) => service.slug === provider)?.tmdbProviderId
    : undefined;
  const watchRegion = process.env.TMDB_WATCH_REGION ?? "US";

  let url: string;
  if (providerId) {
    const genrePart = !genre || genre === "all" ? "" : `&with_genres=${genre}`;
    url = `${TMDB_BASE}/discover/movie?api_key=${apiKey}&sort_by=popularity.desc&page=${page}&vote_count.gte=100&watch_region=${watchRegion}&with_watch_providers=${providerId}${genrePart}`;
  } else if (!genre || genre === "all") {
    // Randomize between broad trending, current year, and upcoming/future movies (e.g. 2025/2026)
    const rand = Math.random();
    const currentYear = new Date().getFullYear();
    if (rand > 0.7) {
      // 30% chance: Upcoming / Future movies (e.g. 2026)
      url = `${TMDB_BASE}/discover/movie?api_key=${apiKey}&sort_by=popularity.desc&page=${page}&primary_release_date.gte=${currentYear + 1}-01-01`;
    } else if (rand > 0.4) {
      // 30% chance: Current Year releases
      url = `${TMDB_BASE}/discover/movie?api_key=${apiKey}&sort_by=popularity.desc&page=${page}&primary_release_date.gte=${currentYear}-01-01&vote_count.gte=10`;
    } else {
      // 40% chance: Trending this week
      url = `${TMDB_BASE}/trending/movie/week?api_key=${apiKey}&page=${page}`;
    }
  } else {
    // Genre-filtered popular movies
    url = `${TMDB_BASE}/discover/movie?api_key=${apiKey}&with_genres=${genre}&sort_by=popularity.desc&page=${page}&vote_count.gte=100`;
  }

  try {
    const res = await fetch(url, {
      next: { revalidate: 3600 },
    });

    if (!res.ok) {
      throw new Error(`TMDB responded ${res.status}`);
    }

    const data = (await res.json()) as { results: Record<string, unknown>[] };
    let movies: Movie[] = data.results
      .filter((m) => m.poster_path) // skip entries without artwork
      .map(mapMovie);

    // Shuffle the movies so the UI looks completely random on every load
    movies = movies.sort(() => 0.5 - Math.random());

    return NextResponse.json(movies);
  } catch (err) {
    console.error("[api/movies]", err);
    return NextResponse.json({ error: "Failed to fetch movies" }, { status: 500 });
  }
}
