import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import clientPromise from "@/lib/mongodb";

const DB_NAME = "dxbmovies";
const COLLECTION = "userPreferences";

async function getUserId() {
  const session = await getServerSession(authOptions);
  return (session?.user as { id?: string } | undefined)?.id ?? null;
}

/**
 * GET /api/user/dna — returns the user's movie DNA genres.
 */
export async function GET() {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const client = await clientPromise;
    const col = client.db(DB_NAME).collection(COLLECTION);
    const doc = await col.findOne({ userId });
    return NextResponse.json({ genres: doc?.genres ?? [] });
  } catch (err) {
    console.error("[dna GET]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/**
 * PUT /api/user/dna — updates the user's movie DNA.
 * Body: { genres: string[] }
 */
export async function PUT(request: Request) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { genres: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!Array.isArray(body.genres)) {
    return NextResponse.json({ error: "genres array required" }, { status: 400 });
  }

  // Cap at 10 genres.
  const genres = body.genres.slice(0, 10);

  try {
    const client = await clientPromise;
    const col = client.db(DB_NAME).collection(COLLECTION);
    await col.updateOne(
      { userId },
      { $set: { genres, updatedAt: new Date() }, $setOnInsert: { userId } },
      { upsert: true },
    );
    return NextResponse.json({ ok: true, genres });
  } catch (err) {
    console.error("[dna PUT]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/**
 * POST /api/user/dna — completes user onboarding.
 * Body: { displayName: string, streamingServices: string[], favoriteGenres: number[], onboardingDone: true }
 */
export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  try {
    const client = await clientPromise;
    const db = client.db(DB_NAME);

    // Save preferences
    await db.collection(COLLECTION).updateOne(
      { userId },
      { 
        $set: { 
          genres: body.favoriteGenres || [], 
          streamingServices: body.streamingServices || [],
          updatedAt: new Date() 
        },
        $setOnInsert: { userId }
      },
      { upsert: true }
    );

    // Update user profile
    const { ObjectId } = require("mongodb");
    await db.collection("users").updateOne(
      { _id: new ObjectId(userId) },
      { 
        $set: { 
          name: body.displayName || "User",
          onboardingDone: true 
        } 
      }
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[dna POST]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
