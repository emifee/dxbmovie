import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import clientPromise from "@/lib/mongodb";

const DB_NAME = "dxbmovies";
const COLLECTION = "reactions";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Accept movie metadata alongside the reaction so it can be used in recommendations
    const { movieId, reaction, movie } = await req.json() as {
      movieId: number;
      reaction: "like" | "dislike" | "none";
      movie?: { title?: string; genres?: string[]; genreIds?: number[] };
    };

    if (!movieId || !["like", "dislike", "none"].includes(reaction)) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db(DB_NAME);

    await db.collection(COLLECTION).updateOne(
      { userId, movieId },
      {
        $set: {
          reaction,
          updatedAt: new Date(),
          // Store movie metadata for use in recommendation algorithm
          ...(movie?.title && { movieTitle: movie.title }),
          ...(movie?.genres && { movieGenres: movie.genres }),
          ...(movie?.genreIds && { movieGenreIds: movie.genreIds }),
        },
      },
      { upsert: true },
    );

    return NextResponse.json({ success: true, reaction });
  } catch (err) {
    console.error("[reactions POST]", err);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!userId) return NextResponse.json([], { status: 200 });

    const client = await clientPromise;
    const db = client.db(DB_NAME);
    const reactions = await db.collection(COLLECTION).find({ userId }).toArray();

    return NextResponse.json(
      reactions.map((r) => ({
        movieId: r.movieId,
        reaction: r.reaction,
        movieTitle: r.movieTitle ?? null,
        movieGenres: r.movieGenres ?? [],
      })),
    );
  } catch (err) {
    console.error("[reactions GET]", err);
    return NextResponse.json([], { status: 500 });
  }
}

