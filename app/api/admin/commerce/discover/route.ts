import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { CommerceEngine } from "@/lib/commerce/engine";
import { getCommerceProvider } from "@/lib/commerce/provider-factory";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userRole = (session?.user as any)?.role;

    if (userRole !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { movieId } = await req.json();

    if (!movieId) {
      return NextResponse.json({ error: "Missing movieId" }, { status: 400 });
    }

    const provider = getCommerceProvider();
    const engine = new CommerceEngine(provider);
    
    const products = await engine.runDiscovery(movieId);

    return NextResponse.json({ 
      success: true, 
      discoveredCount: products.length,
      products 
    });
  } catch (error) {
    console.error("Discovery error:", error);
    return NextResponse.json({ error: "Failed to run discovery" }, { status: 500 });
  }
}
