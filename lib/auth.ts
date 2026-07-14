import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { MongoDBAdapter } from "@next-auth/mongodb-adapter";
import { ObjectId } from "mongodb";
import clientPromise from "./mongodb";
import { sendEmail } from "./email";
import { getWelcomeEmailHtml } from "./email-templates";
import { MOCK_MOVIES } from "./mock-data";
import type { Movie } from "./types";

/** Fetch live trending movies from TMDB — falls back to MOCK_MOVIES on failure. */
async function fetchTrendingMovies(): Promise<Movie[]> {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) return MOCK_MOVIES;
  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/trending/all/week?api_key=${apiKey}&language=en-US`,
      { next: { revalidate: 3600 } }
    );
    if (!res.ok) return MOCK_MOVIES;
    const data = await res.json();
    const GENRE_MAP: Record<number, string> = {
      28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy", 80: "Crime",
      18: "Drama", 27: "Horror", 10749: "Romance", 878: "Sci-Fi", 53: "Thriller",
      10759: "Action & Adventure", 10765: "Sci-Fi & Fantasy",
    };
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

export const authOptions: NextAuthOptions = {
  adapter: MongoDBAdapter(clientPromise),

  // Only Google OAuth — no email/credentials providers allowed
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          prompt: "select_account",
          access_type: "offline",
        },
      },
    }),
  ],

  session: {
    strategy: "database",
    maxAge: 30 * 24 * 60 * 60, // 30 days
    updateAge: 24 * 60 * 60,   // refresh session token once per day
  },

  callbacks: {
    // Block any sign-in that is not via Google OAuth
    async signIn({ account }) {
      if (account?.provider !== "google") return false;
      return true;
    },

    session({ session, user }) {
      if (session.user) {
        (session.user as typeof session.user & { id: string; onboardingDone?: boolean }).id = user.id;
        (session.user as typeof session.user & { id: string; onboardingDone?: boolean }).onboardingDone =
          (user as typeof user & { onboardingDone?: boolean }).onboardingDone ?? false;
      }
      return session;
    },

    // Redirect new users to onboarding, returning users straight to home
    async redirect({ url, baseUrl }) {
      // If the callbackUrl is just the base URL (from login page), check if
      // new-user flag was set and redirect to onboarding
      if (url.startsWith(baseUrl)) return url;
      return baseUrl;
    },
  },

  events: {
    async createUser({ user }) {
      // 1. Detect country via ip-api.com (free, no key required)
      try {
        const geoRes = await fetch("http://ip-api.com/json/?fields=country,city,countryCode", { signal: AbortSignal.timeout(3000) });
        if (geoRes.ok) {
          const geo = await geoRes.json();
          if (geo.country) {
            const client = await clientPromise;
            await client.db("dxbmovies").collection("users").updateOne(
              { _id: new ObjectId(user.id) },
              {
                $set: {
                  country: geo.country,
                  countryCode: geo.countryCode || "",
                  city: geo.city || "",
                  registeredAt: new Date(),
                },
              }
            );
          }
        }
      } catch (e) {
        console.error("[createUser] geo detection failed:", e);
      }

      // 2. Send welcome email with 4–6 random live trending movies
      if (user.email) {
        try {
          const trending = await fetchTrendingMovies();
          const shuffled = [...trending].sort(() => 0.5 - Math.random());
          // Pick between 4 and 6 movies randomly
          const count = 4 + Math.floor(Math.random() * 3); // 4, 5, or 6
          const selectedMovies = shuffled.slice(0, count);
          const htmlContent = getWelcomeEmailHtml(user.name || "", selectedMovies);
          await sendEmail({
            to: user.email,
            subject: "Welcome to DXB Movies | Tv Shows 🎬",
            htmlContent,
            senderName: "DXB Movies | Tv Shows",
          });
        } catch (e) {
          console.error("[createUser] welcome email failed:", e);
        }
      }
    },
  },

  pages: {
    signIn: "/login",
    error: "/login", // Redirect auth errors back to login, not a separate page
  },

  // Strict CSRF — next-auth enforces this, but being explicit
  useSecureCookies: process.env.NODE_ENV === "production",
};
