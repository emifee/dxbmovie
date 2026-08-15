import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { CommerceEngine } from "@/lib/commerce/engine";
import { getCommerceProvider } from "@/lib/commerce/provider-factory";

export async function POST(req: Request, { params }: { params: { productId: string } }) {
  try {
    const session = await getServerSession(authOptions);
    const userRole = (session?.user as any)?.role;

    if (userRole !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { productId } = params;

    if (!productId) {
      return NextResponse.json({ error: "Missing productId" }, { status: 400 });
    }

    const provider = getCommerceProvider();
    const engine = new CommerceEngine(provider);
    
    const product = await engine.reverifyProduct(productId);

    if (!product) {
      return NextResponse.json({ error: "Product not found or reverify failed" }, { status: 404 });
    }

    return NextResponse.json({ success: true, product });
  } catch (error: any) {
    console.error("Reverify error:", error);
    return NextResponse.json({ 
      error: "Failed to run reverify",
      message: error.message 
    }, { status: 500 });
  }
}
