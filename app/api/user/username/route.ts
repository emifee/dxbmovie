import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  let { username } = body;
  if (!username || typeof username !== "string") {
    return NextResponse.json({ error: "Username is required" }, { status: 400 });
  }

  // Basic validation & formatting
  username = username.toLowerCase().replace(/[^a-z0-9_]/g, "");
  if (username.length < 3 || username.length > 20) {
    return NextResponse.json({ error: "Username must be 3-20 characters long and contain only letters, numbers, and underscores" }, { status: 400 });
  }
  
  // Basic reserved word filter
  const reserved = ["admin", "root", "support", "dxb", "system", "sonia"];
  if (reserved.includes(username)) {
    return NextResponse.json({ error: "This username is reserved" }, { status: 400 });
  }

  try {
    const client = await clientPromise;
    const db = client.db("dxbmovies");
    
    // Check uniqueness
    const existing = await db.collection("users").findOne({ username });
    if (existing && existing._id.toString() !== userId) {
      return NextResponse.json({ error: "Username is already taken" }, { status: 409 });
    }

    // Update user
    await db.collection("users").updateOne(
      { _id: new ObjectId(userId) },
      { $set: { username } }
    );

    return NextResponse.json({ success: true, username });
  } catch (error) {
    console.error("[POST /api/user/username]", error);
    return NextResponse.json({ error: "Failed to set username" }, { status: 500 });
  }
}
