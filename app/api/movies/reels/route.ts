import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import clientPromise from "@/lib/mongodb";
import { getLanguage } from "@/lib/language";

const TMDB_BASE = "https://api.themoviedb.org/3";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const type = searchParams.get("type") || "movie";
  const mainTrailerKey = searchParams.get("mainKey");
  const mainTitle = searchParams.get("mainTitle");
  const lang = getLanguage();

  // Track interaction in the background (fire-and-forget)
  getServerSession(authOptions).then(async (session) => {
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (userId) {
      try {
        const client = await clientPromise;
        const db = client.db("dxbmovies");
        await db.collection("userPreferences").updateOne(
          { userId },
          { $set: { lastInteractionAt: new Date().toISOString() } },
          { upsert: true }
        );
      } catch (e) {
        console.error("Failed to update interaction time", e);
      }
    }
  }).catch(() => {});

  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Not configured" }, { status: 500 });

  try {
    const reels: { key: string; title: string; backdrop: string | null; movie?: any }[] = [];

    const pageStr = searchParams.get("page") || "1";
    const page = parseInt(pageStr, 10) || 1;

    // 1. Push the main movie's trailer first (if available and page is 1)
    if (id && page === 1) {
      try {
        const fetchUrl = `${TMDB_BASE}/${type}/${id}?api_key=${apiKey}&language=${lang}&append_to_response=videos&include_video_language=${lang},en,null`;
        const res = await fetch(fetchUrl);
        if (res.ok) {
          const r = await res.json();
          const mainMovie = {
            id: r.id as number,
            title: (r.title ?? r.name ?? "") as string,
            overview: (r.overview as string) ?? "",
            posterPath: (r.poster_path as string | null) ?? null,
            backdropPath: (r.backdrop_path as string | null) ?? null,
            releaseDate: (r.release_date ?? r.first_air_date) as string,
            voteAverage: r.vote_average as number,
            genreIds: r.genre_ids,
            mediaType: type as "movie" | "tv",
          };
          
          let key = mainTrailerKey;
          let title = mainTitle || mainMovie.title;

          if (!key && r.videos?.results) {
            const trailer = r.videos.results.find((v: any) => v.type === "Trailer" && v.site === "YouTube") ||
                            r.videos.results.find((v: any) => v.site === "YouTube");
            if (trailer) key = trailer.key;
          }

          if (key) {
            reels.push({ key, title, backdrop: null, movie: mainMovie });
          }
        }
      } catch { }
    }

    // 2. Fetch a LARGER batch of trending/discover items (10 instead of 5)
    //    and request videos inline via append_to_response where possible
    let related: any[] = [];
    if (id) {
      const fetchUrl = `${TMDB_BASE}/${type}/${id}/recommendations?api_key=${apiKey}&language=${lang}&page=${page}`;
      const res = await fetch(fetchUrl, { next: { revalidate: 3600 } });
      if (res.ok) {
        const data = (await res.json()) as { results: any[] };
        related = data.results.filter((r) => r.backdrop_path).slice(0, 10);
      }
    } else {
      let fetchUrl = `${TMDB_BASE}/trending/all/day?api_key=${apiKey}&language=${lang}&page=${page}`;
      
      // Try to get user preferences for a personalized feed
      try {
        const session = await getServerSession(authOptions);
        const userId = (session?.user as { id?: string } | undefined)?.id;
        if (userId) {
          const { getUserPreferences } = await import("@/lib/user-preferences");
          const prefs = await getUserPreferences(userId);
          
          if (prefs) {
            const hasGenres = prefs.topGenres && Object.keys(prefs.topGenres).length > 0;
            const hasSearches = prefs.searchQueries && prefs.searchQueries.length > 0;
            
            if (hasSearches && (page % 2 === 0 || !hasGenres)) {
              const q = prefs.searchQueries[Math.floor(Math.random() * Math.min(prefs.searchQueries.length, 5))];
              fetchUrl = `${TMDB_BASE}/search/multi?api_key=${apiKey}&language=${lang}&query=${encodeURIComponent(q)}&page=${Math.ceil(page / 2)}`;
            } else if (hasGenres) {
              const sortedGenres = Object.entries(prefs.topGenres).sort((a, b) => b[1] - a[1]);
              const topGenreIds = sortedGenres.slice(0, 2).map(g => g[0]).join(',');
              fetchUrl = `${TMDB_BASE}/discover/movie?api_key=${apiKey}&language=${lang}&with_genres=${topGenreIds}&page=${page}`;
            }
          }
        }
      } catch (e) {
        console.error("Personalization error:", e);
      }

      const res = await fetch(fetchUrl, { next: { revalidate: 3600 } });
      if (res.ok) {
        const data = (await res.json()) as { results: any[] };
        const shuffled = data.results?.sort(() => 0.5 - Math.random()) || [];
        related = shuffled.filter((r) => r.backdrop_path && (r.media_type === "movie" || r.media_type === "tv" || !r.media_type)).slice(0, 10);
      }
    }

    // 3. Fetch trailers for ALL related movies in TRUE parallel
    //    Use AbortController with a 4-second timeout per request to prevent hanging
    const trailerPromises = related.map(async (r) => {
      try {
        const rType = r.media_type || type || "movie";
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);
        
        const vRes = await fetch(
          `${TMDB_BASE}/${rType}/${r.id}?api_key=${apiKey}&language=${lang}&append_to_response=videos&include_video_language=${lang},en,null`,
          { next: { revalidate: 3600 }, signal: controller.signal }
        );
        clearTimeout(timeout);
        
        if (!vRes.ok) return null;
        const vData = await vRes.json();
        const videos = vData.videos?.results || [];
        const trailer =
          videos.find((v: any) => v.type === "Trailer" && v.site === "YouTube") ||
          videos.find((v: any) => v.site === "YouTube");
        
        if (trailer) {
          return {
            key: trailer.key,
            title: (r.title ?? r.name ?? "Related") as string,
            backdrop: `https://image.tmdb.org/t/p/w780${r.backdrop_path}`,
            movie: {
              id: r.id,
              title: r.title || r.name,
              overview: r.overview,
              posterPath: r.poster_path,
              backdropPath: r.backdrop_path,
              releaseDate: r.release_date || r.first_air_date,
              voteAverage: r.vote_average,
              genreIds: r.genre_ids,
              mediaType: rType,
            }
          };
        }
      } catch {
        // Timeout or network error — skip this item
      }
      return null;
    });

    const results = (await Promise.all(trailerPromises)).filter(Boolean) as typeof reels;
    reels.push(...results);

    return NextResponse.json(reels);
  } catch (e) {
    console.error("Reels fetch error:", e);
    return NextResponse.json({ error: "Failed to fetch reels" }, { status: 500 });
  }
}
