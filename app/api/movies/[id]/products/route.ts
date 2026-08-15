import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const client = await clientPromise;
    const db = client.db("dxbmovies");
    const productsCol = db.collection("products");

    // Only return products that are explicitly enabled and active (passed verification)
    const rawProducts = await productsCol
      .find({ movieId: params.id, status: "active", enabled: true })
      .sort({ relevanceScore: -1 })
      .toArray();

    // Map `_id` to `id` for frontend consumption, omit internal tracking details
    const products = rawProducts.map((p) => ({
      id: p._id.toString(),
      movieId: p.movieId,
      title: p.title,
      description: p.description,
      image: p.image,
      category: p.category,
      price: p.price,
      currency: p.currency,
      rating: p.rating,
      reviewCount: p.reviewCount,
      merchant: p.merchant,
      affiliateUrl: p.affiliateUrl,
      canonicalProductUrl: p.canonicalProductUrl,
    }));

    return NextResponse.json({ success: true, products });
  } catch (error) {
    console.error("Error fetching products:", error);
    return NextResponse.json({ success: false, products: [] }, { status: 500 });
  }
}
