import clientPromise from "@/lib/mongodb";
import { AIChatMessage } from "@/lib/ai-router";

export interface Conversation {
  externalUserId: string; // e.g., Instagram IGSID
  channel: "instagram_dm" | "instagram_comment" | string;
  messages: AIChatMessage[];
  lastActivity: Date;
}

const COLLECTION_NAME = "conversations";

/**
 * Retrieves the conversation history for a given user on a specific channel.
 * Automatically prunes old messages if the history gets too long.
 */
export async function getConversation(externalUserId: string, channel: string): Promise<AIChatMessage[]> {
  try {
    const client = await clientPromise;
    const db = client.db("dxbmovies");
    const doc = await db.collection(COLLECTION_NAME).findOne({ externalUserId, channel });
    
    if (doc && doc.messages) {
      return doc.messages as AIChatMessage[];
    }
    return [];
  } catch (err) {
    console.error("[db/conversations] getConversation failed:", err);
    return [];
  }
}

/**
 * Saves the conversation history for a user.
 * Limits the history to the last 20 messages to prevent massive context windows.
 */
export async function saveConversation(externalUserId: string, channel: string, messages: AIChatMessage[]): Promise<void> {
  try {
    const client = await clientPromise;
    const db = client.db("dxbmovies");

    // Keep only the last 20 messages to manage context window limits
    const prunedMessages = messages.slice(-20);

    await db.collection(COLLECTION_NAME).updateOne(
      { externalUserId, channel },
      {
        $set: {
          messages: prunedMessages,
          lastActivity: new Date(),
        },
      },
      { upsert: true }
    );
  } catch (err) {
    console.error("[db/conversations] saveConversation failed:", err);
  }
}
