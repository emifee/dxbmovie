import { NextResponse } from "next/server";
import type { Movie } from "@/lib/types";
import { getLanguage } from "@/lib/language";
import { enrichWithProviders } from "@/lib/tmdb-helpers";

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
  const genres = searchParams.get("genres");
  const keywords = searchParams.get("keywords");
  const yearMin = searchParams.get("yearMin");
  const yearMax = searchParams.get("yearMax");
  const country = searchParams.get("country");
  const network = searchParams.get("network");
  const rating = searchParams.get("rating");
  const sort = searchParams.get("sort") || "Popular";
  const page = searchParams.get("page") || "1";
  const lang = getLanguage();

  const params = new URLSearchParams({
    api_key: apiKey,
    language: lang,
    include_adult: "false",
    page: page,
    vote_count_gte: "50", // Filter out obscure noise for ratings/sorting
  });

  if (genres) params.append("with_genres", genres); // Note: frontend uses | to join
  
  if (keywords) {
    // TMDB requires keyword IDs, not text strings. 
    // We'll map the comma separated strings to TMDB IDs by hitting the search/keyword endpoint.
    const keywordArray = keywords.split(",").map(k => k.trim()).filter(Boolean);
    const keywordIds: number[] = [];
    
    for (const kw of keywordArray) {
      const kwRes = await fetch(`${TMDB_BASE}/search/keyword?api_key=${apiKey}&query=${encodeURIComponent(kw)}`);
      if (kwRes.ok) {
        const kwData = await kwRes.json();
        if (kwData.results && kwData.results.length > 0) {
          // Take the exact match or the first one
          const exact = kwData.results.find((r: any) => r.name.toLowerCase() === kw.toLowerCase());
          keywordIds.push((exact || kwData.results[0]).id);
        }
      }
    }
    
    if (keywordIds.length > 0) {
      params.append("with_keywords", keywordIds.join(",")); // AND logic with commas
    }
  }
  
  if (yearMin) {
    if (endpoint.includes("movie")) {
      params.append("primary_release_date.gte", `${yearMin}-01-01`);
    } else {
      params.append("first_air_date.gte", `${yearMin}-01-01`);
    }
  }

  if (yearMax) {
    if (endpoint.includes("movie")) {
      params.append("primary_release_date.lte", `${yearMax}-12-31`);
    } else {
      params.append("first_air_date.lte", `${yearMax}-12-31`);
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

    const countryCode = request.headers.get("x-vercel-ip-country") || "US";
    const enrichedResults = await enrichWithProviders(data.results, apiKey, countryCode);

    const movies: Movie[] = enrichedResults
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
        providers: r._providers,
      }));

    return NextResponse.json(movies);
  } catch {
    return NextResponse.json({ error: "Discover failed" }, { status: 500 });
  }
}
