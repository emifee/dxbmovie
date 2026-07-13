import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import clientPromise from "@/lib/mongodb";

export const dynamic = "force-dynamic";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 100);
}

// GET — fetch all lists for the logged-in user
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const publishedOnly = searchParams.get("published") === "true";

  const client = await clientPromise;
  const db = client.db();

  const query: Record<string, unknown> = { userId: session.user.email };
  if (publishedOnly) query.published = true;

  const lists = await db
    .collection("lists")
    .find(query)
    .sort({ updatedAt: -1 })
    .toArray();

  return NextResponse.json(lists.map((l) => ({ ...l, _id: l._id.toString() })));
}

// POST — create a new list
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { name, description } = body;

  if (!name || typeof name !== "string" || name.trim().length < 3) {
    return NextResponse.json({ error: "List name must be at least 3 characters" }, { status: 400 });
  }

  const client = await clientPromise;
  const db = client.db();

  // Generate a unique slug
  const baseSlug = slugify(name.trim());
  let slug = baseSlug;
  let attempt = 0;
  while (await db.collection("lists").findOne({ slug })) {
    attempt++;
    slug = `${baseSlug}-${attempt}`;
  }

  // Get the user's username for display
  const userProfile = await db.collection("users").findOne({ email: session.user.email });
  const userName = userProfile?.username || session.user.name || null;

  const now = new Date().toISOString();
  const result = await db.collection("lists").insertOne({
    userId: session.user.email,
    userName,
    name: name.trim(),
    slug,
    description: description?.trim() || "",
    items: [],
    published: false,
    createdAt: now,
    updatedAt: now,
  });

  return NextResponse.json({ _id: result.insertedId.toString(), slug, name: name.trim() });
}
