import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import clientPromise from "@/lib/mongodb";
import { getDeviceId } from "@/lib/device-id"; // We don't import this in API route directly as it uses window, pass deviceId instead

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { deviceId } = await request.json();
    if (!deviceId) {
      return NextResponse.json({ error: "Missing deviceId" }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db();
    
    // Find the anonymous session
    const anonSession = await db.collection("anon_sessions").findOne({ deviceId });
    if (!anonSession || !anonSession.prefs) {
      return NextResponse.json({ ok: true, merged: false });
    }

    // Now we merge this into the authenticated user's preferences
    // For now, we are just saving the anon session attached to the user email so we don't lose it.
    // Real "merging" logic depends on what fields user profiles have. 
    // This connects the device data to the user.
    await db.collection("users").updateOne(
      { email: session.user.email },
      { 
        $set: { 
          mergedDeviceId: deviceId,
          lastTasteSync: new Date()
        },
        $addToSet: {
          previousDevices: deviceId
        }
      }
    );

    // Also link the anon session to this user so we know it was claimed
    await db.collection("anon_sessions").updateOne(
      { deviceId },
      { $set: { claimedBy: session.user.email, claimedAt: new Date() } }
    );

    return NextResponse.json({ ok: true, merged: true });
  } catch (err) {
    console.error("[anon/merge]", err);
    return NextResponse.json({ error: "Merge failed" }, { status: 500 });
  }
}
