import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";

export const dynamic = "force-dynamic";

const MAX_ITEMS = 100;

// GET — get a specific list (must be owner)
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const client = await clientPromise;
  const db = client.db();

  let objectId: ObjectId;
  try { objectId = new ObjectId(params.id); } catch {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const list = await db.collection("lists").findOne({ _id: objectId, userId: session.user.email });
  if (!list) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ ...list, _id: list._id.toString() });
}

// PUT — update a list (name, items, published status)
export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { name, description, items, published } = body;

  const client = await clientPromise;
  const db = client.db();

  let objectId: ObjectId;
  try { objectId = new ObjectId(params.id); } catch {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  // Verify ownership
  const existing = await db.collection("lists").findOne({ _id: objectId, userId: session.user.email });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Validate publish rules
  if (published === true && Array.isArray(items) && items.length < 10) {
    return NextResponse.json({ error: "You need at least 10 items to publish a list." }, { status: 400 });
  }
  if (Array.isArray(items) && items.length > MAX_ITEMS) {
    return NextResponse.json({ error: `Lists can have a maximum of ${MAX_ITEMS} items.` }, { status: 400 });
  }

  const updateFields: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (name !== undefined) updateFields.name = name.trim();
  if (description !== undefined) updateFields.description = description.trim();
  if (items !== undefined) updateFields.items = items;
  if (published !== undefined) updateFields.published = published;

  await db.collection("lists").updateOne({ _id: objectId }, { $set: updateFields });

  return NextResponse.json({ success: true });
}

// DELETE — delete a list
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const client = await clientPromise;
  const db = client.db();

  let objectId: ObjectId;
  try { objectId = new ObjectId(params.id); } catch {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const result = await db.collection("lists").deleteOne({ _id: objectId, userId: session.user.email });
  if (result.deletedCount === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ success: true });
}
