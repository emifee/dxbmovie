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
    
    // Extract US flatrate providers (streaming)
    const usProviders = data["watch/providers"]?.results?.US?.flatrate || [];
    const providers = usProviders.map((p: any) => ({
      name: p.provider_name,
      logoPath: p.logo_path ? `https://image.tmdb.org/t/p/w92${p.logo_path}` : null,
    }));

    // Extract top cast with profile images
    const cast = (data.credits?.cast || []).slice(0, 5).map((c: any) => ({
      name: c.name,
      character: c.character,
      profilePath: c.profile_path ? `https://image.tmdb.org/t/p/w185${c.profile_path}` : null,
    }));

    return NextResponse.json({
      genres,
      providers,
      cast,
    });
  } catch (e) {
    console.error("Detail fetch error:", e);
    return NextResponse.json({ error: "Failed to fetch detail" }, { status: 500 });
  }
}
