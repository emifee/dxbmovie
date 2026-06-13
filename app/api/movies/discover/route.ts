import { NextResponse } from "next/server";
import type { Movie } from "@/lib/types";

const TMDB_BASE = "https://api.themoviedb.org/3";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "movie";
  
  // Base TMDB endpoint (movie vs tv)
  let endpoint = type === "movie" ? "/discover/movie" : "/discover/tv";
  
  // Custom logic for anime/drama types requested by user
  let extraParams = "";
  if (type === "anime") {
    endpoint = "/discover/tv";
    extraParams = "&with_genres=16&with_original_language=ja";
  } else if (type === "drama") {
    endpoint = "/discover/tv";
    extraParams = "&with_genres=18";
  }

  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Not configured" }, { status: 500 });

  // Map frontend params to TMDB params
  const genre = searchParams.get("genre");
  const year = searchParams.get("year");
  const country = searchParams.get("country");
  const network = searchParams.get("network");
  const rating = searchParams.get("rating");
  const sort = searchParams.get("sort") || "Popular";
  const page = searchParams.get("page") || "1";

  const params = new URLSearchParams({
    api_key: apiKey,
    include_adult: "false",
    page: page,
    vote_count_gte: "50", // Filter out obscure noise for ratings/sorting
  });

  if (genre) params.append("with_genres", genre);
  
  if (year) {
    if (endpoint.includes("movie")) {
      params.append("primary_release_year", year);
    } else {
      params.append("first_air_date_year", year);
    }
  }

  if (country) params.append("with_origin_country", country);
  
  // Networks only really apply to TV in TMDB, but we pass it anyway
  if (network) params.append("with_networks", network);
  
  if (rating) {
    // Rating comes in as "9", "8", etc.
    params.append("vote_average.gte", rating);
  }

  // Sorting maps
  const sortMap: Record<string, string> = {
    "Popular": "popularity.desc",
    "Top Rated": "vote_average.desc",
    "Latest Release": endpoint.includes("movie") ? "primary_release_date.desc" : "first_air_date.desc",
    "Oldest Release": endpoint.includes("movie") ? "primary_release_date.asc" : "first_air_date.asc",
    "Title A-Z": "original_title.asc",
    "Title Z-A": "original_title.desc",
    "Revenue": "revenue.desc", // Movie only usually
  };
  params.append("sort_by", sortMap[sort] || "popularity.desc");

  try {
    const fetchUrl = `${TMDB_BASE}${endpoint}?${params.toString()}${extraParams}`;
    const res = await fetch(fetchUrl, { next: { revalidate: 300 } });
    
    if (!res.ok) throw new Error("TMDB discover error");
    const data = (await res.json()) as { results: Record<string, unknown>[] };

    const movies: Movie[] = data.results
      .filter((r) => r.poster_path)
      .map((r) => ({
        id: r.id as number,
        title: (r.title ?? r.name ?? "") as string,
        year: ((r.release_date ?? r.first_air_date ?? "") as string).slice(0, 4),
        rating: Math.round(((r.vote_average as number) ?? 0) * 10) / 10,
        posterPath: (r.poster_path as string | null) ?? null,
        backdropPath: (r.backdrop_path as string | null) ?? null,
        overview: (r.overview as string) ?? "",
        genres: [],
        cast: [],
        mediaType: endpoint.includes("movie") ? "movie" : "tv",
      }));

    return NextResponse.json(movies);
  } catch {
    return NextResponse.json({ error: "Discover failed" }, { status: 500 });
  }
}
