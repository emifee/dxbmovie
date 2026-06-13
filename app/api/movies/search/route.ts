import { NextResponse } from "next/server";
import type { Movie } from "@/lib/types";

const TMDB_BASE = "https://api.themoviedb.org/3";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();
  if (!query) return NextResponse.json([], { status: 200 });

  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Not configured" }, { status: 500 });

  try {
    const res = await fetch(
      `${TMDB_BASE}/search/multi?api_key=${apiKey}&query=${encodeURIComponent(query)}&include_adult=false&page=1`,
      { next: { revalidate: 300 } },
    );
    if (!res.ok) throw new Error("TMDB error");
    const data = (await res.json()) as { results: Record<string, unknown>[] };

    const movies: Movie[] = data.results
      .filter((r) => r.media_type === "movie" || r.media_type === "tv")
      .slice(0, 20)
      .map((r) => ({
        id: r.id as number,
        title: (r.title ?? r.name ?? "") as string,
        year: ((r.release_date ?? r.first_air_date ?? "") as string).slice(0, 4),
        rating: Math.round(((r.vote_average as number) ?? 0) * 10) / 10,
        posterPath: (r.poster_path as string | null) ?? null,
        overview: (r.overview as string) ?? "",
        genres: [],
        cast: [],
        mediaType: (r.media_type as "movie" | "tv") ?? "movie",
      }));

    return NextResponse.json(movies);
  } catch {
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
