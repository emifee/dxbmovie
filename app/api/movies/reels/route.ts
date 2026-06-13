import { NextResponse } from "next/server";

const TMDB_BASE = "https://api.themoviedb.org/3";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const type = searchParams.get("type") || "movie";
  const mainTrailerKey = searchParams.get("mainKey");
  const mainTitle = searchParams.get("mainTitle");

  // If no ID is provided, we fetch trending items to build a random reels feed.
  // if (!id) {
  //   return NextResponse.json({ error: "Missing movie ID" }, { status: 400 });
  // }

  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Not configured" }, { status: 500 });

  try {
    const reels: { key: string; title: string; backdrop: string | null; movie?: any }[] = [];

    const pageStr = searchParams.get("page") || "1";
    const page = parseInt(pageStr, 10) || 1;

    // 1. Push the main movie's trailer first (if available and page is 1)
    if (mainTrailerKey && mainTitle && page === 1) {
      let mainMovie = undefined;
      if (id) {
        try {
          const fetchUrl = `${TMDB_BASE}/${type}/${id}?api_key=${apiKey}`;
          const res = await fetch(fetchUrl);
          if (res.ok) {
            const r = await res.json();
            mainMovie = {
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
          }
        } catch { }
      }
      reels.push({ key: mainTrailerKey, title: mainTitle, backdrop: null, movie: mainMovie });
    }

    // 2. Fetch related movies (or trending if no ID)
    let related: any[] = [];
    if (id) {
      const fetchUrl = `${TMDB_BASE}/${type}/${id}/recommendations?api_key=${apiKey}&language=en-US&page=${page}`;
      const res = await fetch(fetchUrl, { next: { revalidate: 3600 } });
      if (res.ok) {
        const data = (await res.json()) as { results: any[] };
        related = data.results.filter((r) => r.backdrop_path).slice(0, 10);
      }
    } else {
      // Use the requested page from the client to avoid duplicate loops
      const fetchUrl = `${TMDB_BASE}/trending/all/day?api_key=${apiKey}&language=en-US&page=${page}`;
      const res = await fetch(fetchUrl, { next: { revalidate: 3600 } });
      if (res.ok) {
        const data = (await res.json()) as { results: any[] };
        const shuffled = data.results.sort(() => 0.5 - Math.random());
        related = shuffled.filter((r) => r.backdrop_path && (r.media_type === "movie" || r.media_type === "tv")).slice(0, 10);
      }
    }

    // 3. Fetch trailers for related movies in parallel

    const trailerPromises = related.map(async (r) => {
      try {
        const rType = r.media_type || type || "movie";
        const vRes = await fetch(
          `${TMDB_BASE}/${rType}/${r.id}?api_key=${apiKey}&append_to_response=videos`,
          { next: { revalidate: 3600 } }
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
            title: (r.title ?? r.name ?? "Related") as string,
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
    console.error("Reels fetch error:", e);
    return NextResponse.json({ error: "Failed to fetch reels" }, { status: 500 });
  }
}
