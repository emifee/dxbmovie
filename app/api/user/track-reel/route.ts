import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { trackUserGenre } from "@/lib/user-preferences";

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { genreIds } = body;

    if (!genreIds || !Array.isArray(genreIds)) {
      return NextResponse.json({ error: "Missing genreIds array" }, { status: 400 });
    }

    await trackUserGenre(userId, genreIds);

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Tracking error:", e);
    return NextResponse.json({ error: "Failed to track" }, { status: 500 });
  }
}
