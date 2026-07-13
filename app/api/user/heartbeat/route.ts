import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import clientPromise from "@/lib/mongodb";

export const dynamic = "force-dynamic";

// POST /api/user/heartbeat — update lastSeen for the logged-in user
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const client = await clientPromise;
  const db = client.db();

  await db.collection("users").updateOne(
    { email: session.user.email },
    { $set: { lastSeen: new Date().toISOString() } },
    { upsert: true }
  );

  return NextResponse.json({ ok: true });
}
