import { NextResponse } from "next/server";
import type { Movie } from "@/lib/types";
import { enrichWithProviders } from "@/lib/tmdb-helpers";

const TMDB_BASE = "https://api.themoviedb.org/3";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Missing actor ID" }, { status: 400 });
  }

  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Not configured" }, { status: 500 });

  try {
    // Fetch person details and combined credits (movies and tv shows)
    const fetchUrl = `${TMDB_BASE}/person/${id}?api_key=${apiKey}&append_to_response=combined_credits`;
    const res = await fetch(fetchUrl, { next: { revalidate: 3600 } });

    if (!res.ok) throw new Error("Failed to fetch actor");
    const data = await res.json();

    // Sort credits by popularity and filter out missing posters
    const credits = (data.combined_credits?.cast || [])
      .filter((c: any) => c.poster_path && c.vote_count > 10)
      .sort((a: any, b: any) => b.popularity - a.popularity)
      .slice(0, 20); // Get top 20 movies/shows

    const countryCode = request.headers.get("x-vercel-ip-country") || "US";
    const enrichedCredits = await enrichWithProviders(credits, apiKey, countryCode);

    const movies: Movie[] = enrichedCredits.map((r: any) => ({
      id: r.id as number,
      title: (r.title ?? r.name ?? "") as string,
      year: ((r.release_date ?? r.first_air_date ?? "") as string).slice(0, 4),
      rating: Math.round(((r.vote_average as number) ?? 0) * 10) / 10,
      posterPath: (r.poster_path as string | null) ?? null,
      backdropPath: (r.backdrop_path as string | null) ?? null,
      overview: (r.overview as string) ?? "",
      genres: [],
      cast: [],
      mediaType: (r.media_type as "movie" | "tv") ?? "movie",
      providers: r._providers,
    }));

    return NextResponse.json({
      id: data.id,
      name: data.name,
      biography: data.biography,
      birthday: data.birthday,
      placeOfBirth: data.place_of_birth,
      profilePath: data.profile_path ? `https://image.tmdb.org/t/p/w500${data.profile_path}` : null,
      knownForDepartment: data.known_for_department,
      movies,
    });
  } catch (e) {
    console.error("Actor fetch error:", e);
    return NextResponse.json({ error: "Failed to fetch actor" }, { status: 500 });
  }
}
