import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import clientPromise from "@/lib/mongodb";

export async function POST() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const client = await clientPromise;
    const db = client.db("dxbmovies");
    await db.collection("userPreferences").updateOne(
      { userId },
      {
        $set: { pushEnabled: false },
        $unset: { pushSubscription: "" },
      },
    );
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[push/unsubscribe] DB error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
