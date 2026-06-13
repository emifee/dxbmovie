import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import clientPromise from "@/lib/mongodb";
import type { Movie } from "@/lib/types";

const DB_NAME = "dxbmovies";
const COLLECTION = "watchlists";

/** Helper: get the authenticated user's ID or return a 401. */
async function getUserId() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  return userId ?? null;
}

/**
 * GET /api/user/watchlist — returns the user's watchlist.
 */
export async function GET() {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const client = await clientPromise;
    const col = client.db(DB_NAME).collection(COLLECTION);
    const docs = await col
      .find({ userId })
      .sort({ addedAt: -1 })
      .limit(50)
      .toArray();

    const movies: Movie[] = docs.map((d) => d.movie as Movie);
    return NextResponse.json(movies);
  } catch (err) {
    console.error("[watchlist GET]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/**
 * POST /api/user/watchlist — adds a movie.
 * Body: { movie: Movie }
 */
export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { movie: Movie };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!body.movie?.id) {
    return NextResponse.json({ error: "movie.id required" }, { status: 400 });
  }

  try {
    const client = await clientPromise;
    const col = client.db(DB_NAME).collection(COLLECTION);

    let finalMovie = body.movie;
    // If the movie object is incomplete (e.g. sent from a mock reel state), fetch details from TMDB
    if (!finalMovie.title || !finalMovie.posterPath) {
      const TMDB_BASE = "https://api.themoviedb.org/3";
      const apiKey = process.env.TMDB_API_KEY;
      if (apiKey) {
        const type = finalMovie.mediaType || "movie";
        const fetchUrl = `${TMDB_BASE}/${type}/${finalMovie.id}?api_key=${apiKey}`;
        const res = await fetch(fetchUrl);
        if (res.ok) {
          const r = await res.json();
          finalMovie = {
            id: r.id as number,
            title: (r.title ?? r.name ?? "") as string,
            year: ((r.release_date ?? r.first_air_date ?? "") as string).slice(0, 4),
            rating: Math.round(((r.vote_average as number) ?? 0) * 10) / 10,
            posterPath: (r.poster_path as string | null) ?? null,
            backdropPath: (r.backdrop_path as string | null) ?? null,
            overview: (r.overview as string) ?? "",
            genres: [],
            cast: [],
            mediaType: type as "movie" | "tv",
          };
        }
      }
    }

    // Upsert — avoid duplicates.
    await col.updateOne(
      { userId, movieId: finalMovie.id },
      {
        $set: { movie: finalMovie, addedAt: new Date() },
        $setOnInsert: { userId, movieId: finalMovie.id },
      },
      { upsert: true },
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[watchlist POST]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/user/watchlist — removes a movie.
 * Body: { movieId: number }
 */
export async function DELETE(request: Request) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { movieId: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  try {
    const client = await clientPromise;
    const col = client.db(DB_NAME).collection(COLLECTION);
    await col.deleteOne({ userId, movieId: body.movieId });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[watchlist DELETE]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
