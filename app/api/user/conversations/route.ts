import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import clientPromise from "@/lib/mongodb";
import type { ChatMessage } from "@/lib/types";

const DB_NAME = "dxbmovies";
const COLLECTION = "chatSessions";

async function getUserId() {
  const session = await getServerSession(authOptions);
  return (session?.user as { id?: string } | undefined)?.id ?? null;
}

/**
 * GET /api/user/conversations — returns the user's recent chat sessions.
 */
export async function GET() {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const client = await clientPromise;
    const col = client.db(DB_NAME).collection(COLLECTION);
    const docs = await col
      .find({ userId })
      .sort({ updatedAt: -1 })
      .limit(20)
      .toArray();

    const sessions = docs.map((d) => ({
      id: d.sessionId as string,
      title: d.title as string,
      updatedAt: (d.updatedAt as Date).getTime(),
      messages: d.messages as ChatMessage[],
    }));

    return NextResponse.json(sessions);
  } catch (err) {
    console.error("[conversations GET]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/**
 * POST /api/user/conversations — saves or updates a chat session.
 * Body: { sessionId: string, title: string, messages: ChatMessage[] }
 */
export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { sessionId: string; title: string; messages: ChatMessage[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!body.sessionId || !body.title || !Array.isArray(body.messages)) {
    return NextResponse.json(
      { error: "sessionId, title, and messages required" },
      { status: 400 },
    );
  }

  try {
    const client = await clientPromise;
    const col = client.db(DB_NAME).collection(COLLECTION);

    await col.updateOne(
      { userId, sessionId: body.sessionId },
      {
        $set: {
          title: body.title,
          messages: body.messages,
          updatedAt: new Date(),
        },
        $setOnInsert: { userId, sessionId: body.sessionId, createdAt: new Date() },
      },
      { upsert: true },
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[conversations POST]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/user/conversations?id=XYZ — deletes a chat session.
 */
export async function DELETE(request: Request) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("id");

  if (!sessionId) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  try {
    const client = await clientPromise;
    const col = client.db(DB_NAME).collection(COLLECTION);

    await col.deleteOne({ userId, sessionId });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[conversations DELETE]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
