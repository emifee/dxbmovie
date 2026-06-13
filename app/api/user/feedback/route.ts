import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import clientPromise from "@/lib/mongodb";

export async function POST(request: Request) {
  let body: { type: "review" | "features"; rating?: number; comment?: string; features?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;

  try {
    const client = await clientPromise;
    const db = client.db("dxbmovies");
    await db.collection("feedback").insertOne({
      userId,
      type: body.type,
      ...(body.type === "review" ? { rating: body.rating, comment: body.comment ?? "" } : {}),
      ...(body.type === "features" ? { features: body.features ?? [] } : {}),
      createdAt: new Date(),
    });
  } catch (e) {
    console.error("[api/feedback]", e);
  }

  return NextResponse.json({ ok: true });
}
