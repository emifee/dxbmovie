import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { UserList } from "@/lib/types";

export async function POST(
  req: Request,
  { params }: { params: { slug: string } }
) {
  try {
    const { action, prevVote } = await req.json();
    if (action !== "upvote" && action !== "downvote") {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db("dxbmovies");

    const updateQuery: any = { $inc: {} };
    
    if (action === "upvote") {
      updateQuery.$inc.upvotes = 1;
      if (prevVote === "downvote") updateQuery.$inc.downvotes = -1;
    } else {
      updateQuery.$inc.downvotes = 1;
      if (prevVote === "upvote") updateQuery.$inc.upvotes = -1;
    }
    
    // Find and update the list
    const result = await db.collection("lists").findOneAndUpdate(
      { slug: params.slug },
      updateQuery,
      { returnDocument: "after" }
    );

    const updatedList = result.value as unknown as UserList;

    if (!updatedList) {
      return NextResponse.json({ error: "List not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      upvotes: updatedList.upvotes || 0,
      downvotes: updatedList.downvotes || 0
    });
  } catch (error) {
    console.error("Error updating list vote:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
