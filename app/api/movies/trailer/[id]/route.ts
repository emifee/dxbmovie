import { NextResponse } from "next/server";

const TMDB_BASE = "https://api.themoviedb.org/3";

export async function GET(
  request: Request,
  { params }: { params: { id: string } },
) {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "TMDB_API_KEY not configured" }, { status: 500 });
  }

  const movieId = parseInt(params.id, 10);
  if (isNaN(movieId)) {
    return NextResponse.json({ error: "Invalid movie id" }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const mediaType = searchParams.get("type") === "tv" ? "tv" : "movie";

  try {
    const res = await fetch(
      `${TMDB_BASE}/${mediaType}/${movieId}/videos?api_key=${apiKey}`,
      { next: { revalidate: 86400 } }, // cache 24h
    );

    if (!res.ok) throw new Error(`TMDB ${res.status}`);

    const data = (await res.json()) as {
      results: { key: string; site: string; type: string; official: boolean; name: string }[];
    };

    // Filter to only YouTube videos
    const videos = data.results.filter((v) => v.site === "YouTube");

    // Smart selection logic to avoid mismatched or weird trailers:
    // 1. "Official Trailer" in name
    // 2. Any official Trailer
    // 3. Any Trailer
    // 4. Any official Teaser
    const trailer =
      videos.find((v) => v.type === "Trailer" && v.official && v.name.toLowerCase().includes("official trailer")) ??
      videos.find((v) => v.type === "Trailer" && v.official) ??
      videos.find((v) => v.type === "Trailer") ??
      videos.find((v) => v.type === "Teaser" && v.official) ??
      videos.find((v) => v.type === "Teaser") ??
      null;

    return NextResponse.json({ key: trailer?.key ?? null });
  } catch (err) {
    console.error("[api/movies/trailer]", err);
    return NextResponse.json({ key: null });
  }
}
