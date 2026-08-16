import clientPromise from "@/lib/mongodb";

export interface InstagramShadowLog {
  commentId: string;
  mediaId: string;
  rootCommentId: string;
  userIdentifier: string;
  rawText: string;
  decision: string;
  intent: string;
  scheduledDelayMs?: number;
  processedDelayMs?: number;
  wouldReply: boolean;
  generatedResponse?: string;
  evidenceUsed?: string[];
  model?: string;
  reasonIgnored?: string;
  budgetCeilingHit?: boolean;
  humanTakeoverActive?: boolean;
  createdAt: Date;
}

const COLLECTION_NAME = "instagram_shadow_logs";

export async function saveShadowLog(log: InstagramShadowLog) {
  const client = await clientPromise;
  const db = client.db("dxbmovies");
  await db.collection<InstagramShadowLog>(COLLECTION_NAME).insertOne(log);
}
