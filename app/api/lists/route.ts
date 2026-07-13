import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import clientPromise from "@/lib/mongodb";

export const dynamic = "force-dynamic";

const ONLINE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

/**
 * GET /api/lists
 * 
 * Returns lists for the home page filter pills:
 * - Always: logged-in user's own published lists
 * - Additionally: other users' published lists where creator was active in last 10 min
 * 
 * Query params:
 * - ?all=true → bypass auth, only return online users' lists (for non-signed-in view)
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  const client = await clientPromise;
  const db = client.db();

  const onlineCutoff = new Date(Date.now() - ONLINE_THRESHOLD_MS).toISOString();

  // Get all published lists where creator is online (for the social discovery aspect)
  const onlineLists = await db
    .collection("lists")
    .find({
      published: true,
      userId: { $ne: session?.user?.email || "" },
    })
    .sort({ updatedAt: -1 })
    .toArray();

  // Filter to only include lists where the creator has been seen recently
  const onlineUserEmails = new Set<string>();
  for (const list of onlineLists) {
    if (list.userId) {
      const user = await db.collection("users").findOne({
        email: list.userId,
        lastSeen: { $gte: onlineCutoff },
      });
      if (user) onlineUserEmails.add(list.userId);
    }
  }

  const filteredOnlineLists = onlineLists
    .filter((l) => onlineUserEmails.has(l.userId))
    .map((l) => ({ ...l, _id: l._id.toString(), creatorOnline: true }));

  // If signed in, also include the user's own published lists
  let ownLists: any[] = [];
  if (session?.user?.email) {
    const own = await db
      .collection("lists")
      .find({ userId: session.user.email, published: true })
      .sort({ updatedAt: -1 })
      .toArray();
    ownLists = own.map((l) => ({ ...l, _id: l._id.toString(), creatorOnline: false }));
  }

  // Merge, deduplicate, own lists first
  const allIds = new Set(ownLists.map((l) => l._id));
  const merged = [
    ...ownLists,
    ...filteredOnlineLists.filter((l) => !allIds.has(l._id)),
  ];

  return NextResponse.json(merged);
}
