import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import clientPromise from "@/lib/mongodb";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { source } = await req.json();
    if (!source) {
      return new NextResponse("Missing source", { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db();

    // Update the user's signupSource ONLY if it doesn't already exist.
    // This ensures we only capture the very first action that caused them to sign up,
    // and not subsequent logins on different devices.
    await db.collection("users").updateOne(
      { email: session.user.email },
      { $set: { lastActiveSource: source } } // Optional: track latest activity
    );

    await db.collection("users").updateOne(
      { email: session.user.email, signupSource: { $exists: false } },
      { $set: { signupSource: source } }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to track signup source:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
