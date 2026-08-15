import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const body = await request.json();

    const {
      movieId,
      productId,
      merchant,
      source,
      sessionId,
      country,
      provider,
      productCategory,
      region,
      position,
      featured,
      utmSource,
      utmMedium,
      utmCampaign,
    } = body;

    // Validate required fields
    if (!movieId || !productId || !merchant || !source) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const clickData = {
      movieId,
      productId,
      merchant,
      source,
      provider: provider || "unknown",
      productCategory: productCategory || "unknown",
      region: region || "unknown",
      position: position || 0,
      featured: featured || false,
      utmSource: utmSource || null,
      utmMedium: utmMedium || null,
      utmCampaign: utmCampaign || null,
      userId: (session?.user as { id?: string } | undefined)?.id || null,
      sessionId: sessionId || "anonymous",
      country: country || "unknown",
      clickedAt: new Date(),
    };

    // Log to console for development verification
    console.log("[COMMERCE TRACKING] Click logged:", clickData);

    // Persist to MongoDB
    const client = await clientPromise;
    const db = client.db("dxbmovies");
    await db.collection("product_clicks").insertOne(clickData);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[COMMERCE TRACKING] Error logging click:", error);
    return NextResponse.json({ error: "Failed to log click" }, { status: 500 });
  }
}

