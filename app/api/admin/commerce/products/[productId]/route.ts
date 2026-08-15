import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";

export async function PATCH(req: Request, { params }: { params: { productId: string } }) {
  try {
    const session = await getServerSession(authOptions);
    const userRole = (session?.user as any)?.role;

    if (userRole !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { status, enabled } = await req.json();

    const client = await clientPromise;
    const db = client.db("dxbmovies");
    const productsCol = db.collection("products");

    await productsCol.updateOne(
      { _id: new ObjectId(params.productId) },
      { $set: { status, enabled, updatedAt: new Date().toISOString() } }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update product error:", error);
    return NextResponse.json({ error: "Failed to update product" }, { status: 500 });
  }
}
