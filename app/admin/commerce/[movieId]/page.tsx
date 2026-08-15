import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import clientPromise from "@/lib/mongodb";
import { MovieProduct } from "@/lib/types";
import CommerceAdminClient from "./client";

export default async function AdminCommercePage({ params }: { params: { movieId: string } }) {
  const session = await getServerSession(authOptions);
  const userRole = (session?.user as any)?.role;

  if (userRole !== "ADMIN") {
    redirect("/");
  }

  const movieId = params.movieId;

  const client = await clientPromise;
  const db = client.db("dxbmovies");
  const productsCol = db.collection("products");

  const rawProducts = await productsCol.find({ movieId: movieId.toString() }).sort({ relevanceScore: -1 }).toArray();
  const products = rawProducts.map(p => ({
    ...p,
    _id: p._id.toString(),
  })) as unknown as MovieProduct[];

  const discoveryRunsCol = db.collection("discovery_runs");
  const latestRunRaw = await discoveryRunsCol.find({ movieId: movieId.toString() }).sort({ startedAt: -1 }).limit(1).toArray();
  const latestRun = latestRunRaw.length > 0 ? {
    ...latestRunRaw[0],
    _id: latestRunRaw[0]._id.toString(),
  } : null;

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Commerce Admin: Movie {movieId}</h1>
        <CommerceAdminClient initialProducts={products} movieId={movieId} latestRun={latestRun as any} />
      </div>
    </div>
  );
}
