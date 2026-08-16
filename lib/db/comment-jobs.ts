import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";

export type CommentIntent = "immediate" | "short_delay" | "medium_delay" | "long_delay";
export type JobStatus = "pending" | "completed" | "failed";

export interface InstagramCommentJob {
  _id?: ObjectId;
  commentId: string;
  mediaId: string;
  rootCommentId: string;
  intent: CommentIntent;
  status: JobStatus;
  scheduledFor: Date;
  createdAt: Date;
}

const COLLECTION_NAME = "instagram_comment_jobs";

async function getCollection() {
  const client = await clientPromise;
  const db = client.db("dxbmovies");
  return db.collection<InstagramCommentJob>(COLLECTION_NAME);
}

export async function scheduleCommentJob(job: Omit<InstagramCommentJob, "_id" | "status" | "createdAt">): Promise<string> {
  const col = await getCollection();
  
  // Idempotency: if we already scheduled a job for this comment, skip it.
  const existing = await col.findOne({ commentId: job.commentId });
  if (existing) {
    return existing._id!.toString();
  }

  const result = await col.insertOne({
    ...job,
    status: "pending",
    createdAt: new Date(),
  });

  return result.insertedId.toString();
}

export async function getPendingCommentJobs(): Promise<InstagramCommentJob[]> {
  const col = await getCollection();
  const now = new Date();
  
  // Find pending jobs where the scheduled time has passed
  return col.find({
    status: "pending",
    scheduledFor: { $lte: now }
  }).toArray();
}

export async function markJobComplete(id: string, newStatus: JobStatus = "completed") {
  const col = await getCollection();
  await col.updateOne(
    { _id: new ObjectId(id) },
    { $set: { status: newStatus } }
  );
}
