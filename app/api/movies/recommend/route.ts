/**
 * GET /api/movies/recommend
 *
 * Personalised movie recommendations driven by the user's:
 *   • DNA genres (set in profile)
 *   • Liked movie genres (weighted by frequency)
 *   • Disliked movie genres (excluded)
 *   • Watchlist movie IDs (excluded from results)
 *   • Disliked movie IDs (excluded from results)
 *
 * Falls back to popular movies for unauthenticated / new users.
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import clientPromise from "@/lib/mongodb";
import type { Movie } from "@/lib/types";

const TMDB_BASE = "https://api.themoviedb.org/3";

// TMDB genre name → ID mapping
const GENRE_NAME_TO_ID: Record<string, number> = {
  Action: 28, Adventure: 12, Animation: 16, Comedy: 35, Crime: 80,
  Documentary: 99, Drama: 18, Family: 10751, Fantasy: 14, History: 36,
  Horror: 27, Music: 10402, Mystery: 9648, Romance: 10749,
  "Science Fiction": 878, "Sci-Fi": 878, Thriller: 53, War: 10752,
  Western: 37, "TV Movie": 10770,
};

function genreNamesToIds(names: string[]): number[] {
  return Array.from(new Set(names.map((n) => GENRE_NAME_TO_ID[n]).filter(Boolean)));
}

function mapTmdbToMovie(item: Record<string, unknown>, mediaType: "movie" | "tv"): Movie {
  const releaseDate = ((item.release_date ?? item.first_air_date ?? "") as string).slice(0, 4);
  return {
    id: item.id as number,
    title: (item.title ?? item.name ?? "") as string,
    year: releaseDate,
    rating: Math.round(((item.vote_average as number) ?? 0) * 10) / 10,
    posterPath: (item.poster_path as string | null) ?? null,
    backdropPath: (item.backdrop_path as string | null) ?? null,
    overview: (item.overview as string) ?? "",
    genres: [],
    cast: [],
    mediaType,
  };
}

export async function GET() {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Not configured" }, { status: 500 });

  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;

  // ── Fetch user signals ────────────────────────────────────────────────────
  let dnaGenreIds: number[] = [];
  let excludeMovieIds = new Set<number>();
  let dislikedGenreIds = new Set<number>();

  if (userId) {
    try {
      const client = await clientPromise;
      const db = client.db("dxbmovies");

      const [prefs, watchlistDocs, reactionDocs] = await Promise.all([
        db.collection("userPreferences").findOne({ userId }),
        db.collection("watchlists").find({ userId }).toArray(),
        db.collection("reactions").find({ userId }).toArray(),
      ]);

      // DNA genres → TMDB IDs
      const dnaGenres: string[] = prefs?.genres ?? [];
      dnaGenreIds = genreNamesToIds(dnaGenres);

      // Watchlist IDs to exclude
      for (const doc of watchlistDocs) {
        if (doc.movie?.id) excludeMovieIds.add(doc.movie.id as number);
      }

      // Reaction signals
      const likedGenreFreq: Record<number, number> = {};
      for (const r of reactionDocs) {
        const ids: number[] = Array.isArray(r.movieGenreIds)
          ? (r.movieGenreIds as number[])
          : genreNamesToIds(Array.isArray(r.movieGenres) ? (r.movieGenres as string[]) : []);

        if (r.reaction === "like") {
          for (const id of ids) likedGenreFreq[id] = (likedGenreFreq[id] ?? 0) + 1;
        }
        if (r.reaction === "dislike") {
          if (r.movieId) excludeMovieIds.add(r.movieId as number);
          for (const id of ids) dislikedGenreIds.add(id);
        }
      }

      // Merge liked genre frequencies into DNA (DNA genres get base weight of 2)
      const genreScore: Record<number, number> = {};
      for (const id of dnaGenreIds) genreScore[id] = (genreScore[id] ?? 0) + 2;
      for (const [id, freq] of Object.entries(likedGenreFreq)) {
        genreScore[Number(id)] = (genreScore[Number(id)] ?? 0) + freq;
      }
      // Remove disliked genres
      for (const id of Array.from(dislikedGenreIds)) delete genreScore[id];

      // Top 3 genres by score
      const topGenres = Object.entries(genreScore)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([id]) => Number(id));

      if (topGenres.length > 0) dnaGenreIds = topGenres;
    } catch (e) {
      console.error("[recommend] user signal fetch failed", e);
    }
  }

  // ── Fetch movies from TMDB ────────────────────────────────────────────────
  const results: Movie[] = [];

  try {
    if (dnaGenreIds.length > 0) {
      // Fetch 2 pages per media type with personalised genres
      for (const mediaType of ["movie", "tv"] as const) {
        const endpoint = mediaType === "movie" ? "/discover/movie" : "/discover/tv";
        for (const page of [1, 2]) {
          const params = new URLSearchParams({
            api_key: apiKey,
            with_genres: dnaGenreIds.join(","),
            sort_by: "vote_average.desc",
            "vote_count.gte": "200",
            include_adult: "false",
            page: String(page),
          });
          const res = await fetch(`${TMDB_BASE}${endpoint}?${params}`, {
            next: { revalidate: 3600 },
          });
          if (!res.ok) continue;
          const data = (await res.json()) as { results: Record<string, unknown>[] };
          for (const item of data.results ?? []) {
            const id = item.id as number;
            if (!excludeMovieIds.has(id)) {
              results.push(mapTmdbToMovie(item, mediaType));
            }
          }
        }
      }
    }

    // Top up with trending if not enough personalised results
    if (results.length < 20) {
      const trendRes = await fetch(
        `${TMDB_BASE}/trending/all/week?api_key=${apiKey}&include_adult=false`,
        { next: { revalidate: 3600 } },
      );
      if (trendRes.ok) {
        const trendData = (await trendRes.json()) as { results: Record<string, unknown>[] };
        for (const item of trendData.results ?? []) {
          const id = item.id as number;
          const mt = (item.media_type as string) === "tv" ? "tv" : "movie";
          if (!excludeMovieIds.has(id) && !results.find((r) => r.id === id)) {
            results.push(mapTmdbToMovie(item, mt));
          }
        }
      }
    }

    // Shuffle slightly so it's not the same order every time
    const shuffled = results.sort(() => 0.5 - Math.random()).slice(0, 40);
    return NextResponse.json({ movies: shuffled, personalised: dnaGenreIds.length > 0 });
  } catch (e) {
    console.error("[recommend] TMDB fetch failed", e);
    return NextResponse.json({ error: "Failed to fetch recommendations" }, { status: 500 });
  }
}
