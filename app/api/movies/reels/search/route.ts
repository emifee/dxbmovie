import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getLanguage } from "@/lib/language";
import { trackUserSearch } from "@/lib/user-preferences";

const TMDB_BASE = "https://api.themoviedb.org/3";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");
  const lang = getLanguage();
  
  if (!query) {
    return NextResponse.json({ error: "Missing search query" }, { status: 400 });
  }

  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Not configured" }, { status: 500 });

  // Track the search for personalized recommendations
  getServerSession(authOptions).then(async (session) => {
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (userId) {
      await trackUserSearch(userId, query);
    }
  }).catch(() => {});

  try {
    const reels: { key: string; title: string; backdrop: string | null; movie?: any }[] = [];

    // Search for movies and TV shows
    const fetchUrl = `${TMDB_BASE}/search/multi?api_key=${apiKey}&language=${lang}&query=${encodeURIComponent(query)}&page=1`;
    const res = await fetch(fetchUrl);
    
    if (!res.ok) {
      return NextResponse.json({ error: "TMDB search failed" }, { status: res.status });
    }
    
    const data = (await res.json()) as { results: any[] };
    const related = data.results.filter((r) => r.backdrop_path && (r.media_type === "movie" || r.media_type === "tv")).slice(0, 10);

    // Fetch trailers for related movies in parallel
    const trailerPromises = related.map(async (r) => {
      try {
        const rType = r.media_type || "movie";
        const vRes = await fetch(
          `${TMDB_BASE}/${rType}/${r.id}?api_key=${apiKey}&language=${lang}&append_to_response=videos&include_video_language=${lang},en,null`
        );
        if (!vRes.ok) return null;
        
        const vData = await vRes.json();
        const videos = vData.videos?.results || [];
        const trailer =
          videos.find((v: any) => v.type === "Trailer" && v.site === "YouTube") ||
          videos.find((v: any) => v.site === "YouTube");
        
        if (trailer) {
          return {
            key: trailer.key,
            title: (r.title ?? r.name ?? "Search Result") as string,
            backdrop: `https://image.tmdb.org/t/p/w1280${r.backdrop_path}`,
            movie: {
              id: r.id,
              title: r.title || r.name,
              overview: r.overview,
              posterPath: r.poster_path,
              backdropPath: r.backdrop_path,
              releaseDate: r.release_date || r.first_air_date,
              voteAverage: r.vote_average,
              genreIds: r.genre_ids,
            }
          };
        }
      } catch {
        // ignore
      }
      return null;
    });

    const results = (await Promise.all(trailerPromises)).filter(Boolean) as typeof reels;
    reels.push(...results);

    return NextResponse.json(reels);
  } catch (e) {
    console.error("Reels search error:", e);
    return NextResponse.json({ error: "Failed to search reels" }, { status: 500 });
  }
}
