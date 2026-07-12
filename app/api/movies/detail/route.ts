import { NextResponse } from "next/server";

const TMDB_BASE = "https://api.themoviedb.org/3";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const type = searchParams.get("type") || "movie";

  if (!id) {
    return NextResponse.json({ error: "Missing movie ID" }, { status: 400 });
  }

  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Not configured" }, { status: 500 });

  try {
    const fetchUrl = `${TMDB_BASE}/${type}/${id}?api_key=${apiKey}&append_to_response=watch/providers,credits`;
    const res = await fetch(fetchUrl, { next: { revalidate: 3600 } });

    if (!res.ok) throw new Error("Failed to fetch detail");
    const data = await res.json();

    const genres = (data.genres || []).map((g: any) => g.name);

    const countryCode = request.headers.get("x-vercel-ip-country") || "US";
    const watchData =
      data["watch/providers"]?.results?.[countryCode] ||
      data["watch/providers"]?.results?.US ||
      {};

    // Extract flatrate providers (streaming)
    const flatrateProviders = watchData.flatrate || [];
    const justWatchLink = watchData.link || null;

    const providers = flatrateProviders.map((p: any) => ({
      name: p.provider_name,
      logoPath: p.logo_path ? `https://image.tmdb.org/t/p/w92${p.logo_path}` : null,
      link: justWatchLink,
    }));

    // Extract top cast with profile images
    const cast = (data.credits?.cast || []).slice(0, 5).map((c: any) => ({
      id: c.id,
      name: c.name,
      character: c.character,
      profilePath: c.profile_path ? `https://image.tmdb.org/t/p/w185${c.profile_path}` : null,
    }));

    // Return full movie object so deep-link drawer opens with all data populated
    return NextResponse.json({
      // Core movie fields
      id: data.id,
      title: data.title || data.name,
      name: data.name,
      overview: data.overview || "",
      posterPath: data.poster_path || null,
      backdropPath: data.backdrop_path || null,
      rating: data.vote_average || 0,
      year: (data.release_date || data.first_air_date || "").substring(0, 4),
      mediaType: type,
      genre_ids: (data.genres || []).map((g: any) => g.id),
      cast: [], // raw string cast kept empty; enriched cast is in fullDetails below
      // Enriched detail fields (used by drawer's fullDetails state)
      genres,
      providers,
      enrichedCast: cast,
    });
  } catch (e) {
    console.error("Detail fetch error:", e);
    return NextResponse.json({ error: "Failed to fetch detail" }, { status: 500 });
  }
}
