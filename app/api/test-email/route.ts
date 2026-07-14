import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";
import { getWelcomeEmailHtml } from "@/lib/email-templates";
import { MOCK_MOVIES } from "@/lib/mock-data";
import type { Movie } from "@/lib/types";

const GENRE_MAP: Record<number, string> = {
  28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy", 80: "Crime",
  18: "Drama", 27: "Horror", 10749: "Romance", 878: "Sci-Fi", 53: "Thriller",
  10759: "Action & Adventure", 10765: "Sci-Fi & Fantasy",
};

async function fetchLiveTrending(): Promise<Movie[]> {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) return MOCK_MOVIES;
  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/trending/all/week?api_key=${apiKey}&language=en-US`
    );
    if (!res.ok) return MOCK_MOVIES;
    const data = await res.json();
    return (data.results as any[]).slice(0, 20).map((m) => ({
      id: m.id,
      title: m.title ?? m.name ?? "Untitled",
      year: (m.release_date ?? m.first_air_date ?? "").slice(0, 4),
      rating: Math.round((m.vote_average ?? 0) * 10) / 10,
      posterPath: m.poster_path ?? null,
      backdropPath: m.backdrop_path ?? null,
      overview: m.overview ?? "",
      genres: ((m.genre_ids ?? []) as number[]).map((id) => GENRE_MAP[id]).filter(Boolean),
      cast: [],
      mediaType: (m.media_type === "tv" ? "tv" : "movie") as "movie" | "tv",
    }));
  } catch {
    return MOCK_MOVIES;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const email = searchParams.get("email");
  const name = searchParams.get("name") || "Tester";
  const useLive = searchParams.get("live") !== "false"; // default: use live TMDB

  if (!email) {
    return NextResponse.json({ error: "Missing email parameter" }, { status: 400 });
  }

  try {
    const pool = useLive ? await fetchLiveTrending() : MOCK_MOVIES;
    const shuffled = [...pool].sort(() => 0.5 - Math.random());
    const count = 4 + Math.floor(Math.random() * 3); // 4, 5, or 6
    const selectedMovies = shuffled.slice(0, count);

    const htmlContent = getWelcomeEmailHtml(name, selectedMovies);

    await sendEmail({
      to: email,
      subject: "Welcome to DXB Movies | Tv Shows 🎬 (Preview)",
      htmlContent,
      senderName: "DXB Movies | Tv Shows",
    });

    return NextResponse.json({
      success: true,
      message: `Sent preview email to ${email} with ${selectedMovies.length} movies`,
      movies: selectedMovies.map((m) => m.title),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
