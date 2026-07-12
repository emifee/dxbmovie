import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import type { AnonPrefs } from "@/lib/anon-prefs";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { deviceId, prefs }: { deviceId: string; prefs: AnonPrefs } = await request.json();

    if (!deviceId || typeof deviceId !== "string") {
      return NextResponse.json({ error: "Invalid deviceId" }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db();
    const col = db.collection("anon_sessions");

    await col.updateOne(
      { deviceId },
      {
        $set: {
          deviceId,
          prefs,
          lastSeen: new Date(),
        },
        $setOnInsert: {
          createdAt: new Date(),
        },
      },
      { upsert: true }
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[anon/sync]", err);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
