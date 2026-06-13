import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import clientPromise from "@/lib/mongodb";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let subscription: { endpoint: string; keys: { p256dh: string; auth: string } };
  try {
    subscription = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  }

  try {
    const client = await clientPromise;
    const db = client.db("dxbmovies");
    await db.collection("userPreferences").updateOne(
      { userId },
      {
        $set: {
          pushSubscription: {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
          },
          pushEnabled: true,
          pushSubscribedAt: new Date(),
        },
      },
      { upsert: true },
    );
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[push/subscribe] DB error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
