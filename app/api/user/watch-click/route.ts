import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";

const DB_NAME = "dxbmovies";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { movieId, title, posterUrl, provider, clickedAt } = await req.json();

    if (!movieId || !provider) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db(DB_NAME);

    await db.collection("users").updateOne(
      { _id: new ObjectId(userId) },
      {
        $set: {
          lastWatchClick: { movieId, title, posterUrl, provider, clickedAt: clickedAt || Date.now() },
        },
      }
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[watch-click POST]", err);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!userId) return NextResponse.json({ watchClick: null }, { status: 200 });

    const client = await clientPromise;
    const db = client.db(DB_NAME);

    const user = await db.collection("users").findOne(
      { _id: new ObjectId(userId) },
      { projection: { lastWatchClick: 1 } }
    );

    return NextResponse.json({ watchClick: user?.lastWatchClick || null });
  } catch (err) {
    console.error("[watch-click GET]", err);
    return NextResponse.json({ watchClick: null }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const client = await clientPromise;
    const db = client.db(DB_NAME);

    await db.collection("users").updateOne(
      { _id: new ObjectId(userId) },
      { $unset: { lastWatchClick: "" } }
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[watch-click DELETE]", err);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
