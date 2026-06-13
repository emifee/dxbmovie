import { NextResponse } from "next/server";
import type { Movie } from "@/lib/types";

const TMDB_BASE = "https://api.themoviedb.org/3";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const type = searchParams.get("type") || "movie"; // "movie" or "tv"
  
  if (!id) {
    return NextResponse.json({ error: "Missing movie/show ID" }, { status: 400 });
  }

  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Not configured" }, { status: 500 });

  try {
    // We use recommendations because it often provides better, more curated results than "similar"
    const fetchUrl = `${TMDB_BASE}/${type}/${id}/recommendations?api_key=${apiKey}&language=en-US&page=1`;
    const res = await fetch(fetchUrl, { next: { revalidate: 3600 } });
    
    if (!res.ok) throw new Error("TMDB recommendations error");
    const data = (await res.json()) as { results: Record<string, unknown>[] };

    const movies: Movie[] = data.results
      .filter((r) => r.poster_path) // Only show ones with posters for aesthetic reasons
      .slice(0, 15) // Show top 15 related
      .map((r) => ({
        id: r.id as number,
        title: (r.title ?? r.name ?? "") as string,
        year: ((r.release_date ?? r.first_air_date ?? "") as string).slice(0, 4),
        rating: Math.round(((r.vote_average as number) ?? 0) * 10) / 10,
        posterPath: (r.poster_path as string | null) ?? null,
        overview: (r.overview as string) ?? "",
        genres: [], // We omit genres here as it's just for the poster display
        cast: [],
        mediaType: type as "movie" | "tv", // Keep it consistent with the parent
      }));

    return NextResponse.json(movies);
  } catch (e) {
    console.error("Related fetch error:", e);
    return NextResponse.json({ error: "Failed to fetch related movies" }, { status: 500 });
  }
}
