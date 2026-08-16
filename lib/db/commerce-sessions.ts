import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";

export type CommerceIntent = 
  | "MOVIE_DISCUSSION"
  | "PRODUCT_DISCOVERY" 
  | "PRODUCT_SEARCH" 
  | "PRODUCT_SELECTION" 
  | "CHECKOUT_INTENT";

export interface CommerceSession {
  _id?: ObjectId | string;
  commerceSessionId: string;
  channel: "instagram_dm" | "instagram_comment" | "web";
  externalUserId: string;
  conversationId: string;
  threadId?: string;          // optional, for comment-originated conversations
  currentIntent: CommerceIntent;
  activeMovieId?: string;
  activeMediaId?: string;
  candidateProductIds: string[];
  selectedProductId?: string;
  budget?: number;
  currency?: string;
  country?: string;
  quantity?: number;
  checkoutReady: boolean;
  humanApprovalState?: "pending" | "approved" | "rejected";
  createdAt: Date;
  updatedAt: Date;
}

async function getCollection() {
  const client = await clientPromise;
  const db = client.db("dxbmovies");
  return db.collection<CommerceSession>("commerce_sessions");
}

export async function getCommerceSession(commerceSessionId: string): Promise<CommerceSession | null> {
  const col = await getCollection();
  return col.findOne({ commerceSessionId });
}

export async function getCommerceSessionByConversation(conversationId: string): Promise<CommerceSession | null> {
  const col = await getCollection();
  return col.findOne({ conversationId });
}

export async function upsertCommerceSession(sessionData: Partial<CommerceSession> & { commerceSessionId: string }): Promise<CommerceSession> {
  const col = await getCollection();
  const now = new Date();
  
  const updateDoc = {
    ...sessionData,
    updatedAt: now,
  };

  const result = await col.findOneAndUpdate(
    { commerceSessionId: sessionData.commerceSessionId },
    { 
      $set: updateDoc,
      $setOnInsert: { createdAt: now } 
    },
    { upsert: true, returnDocument: "after" }
  );

  return (result?.value || result) as unknown as CommerceSession;
}
