import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const deviceId = searchParams.get("deviceId");

    if (!deviceId) {
      return NextResponse.json({ error: "Missing deviceId" }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db();
    const col = db.collection("anon_sessions");

    const session = await col.findOne({ deviceId }, { projection: { _id: 0, prefs: 1 } });

    if (!session) {
      return NextResponse.json({ prefs: null });
    }

    return NextResponse.json({ prefs: session.prefs });
  } catch (err) {
    console.error("[anon/load]", err);
    return NextResponse.json({ error: "Load failed" }, { status: 500 });
  }
}
