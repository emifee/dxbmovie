import clientPromise from "@/lib/mongodb";
import { resolveInstagramMediaContext } from "@/lib/instagram/context";
import { fetchComment } from "@/lib/instagram/client";

export interface CommentMessage {
  commentId: string;
  parentCommentId?: string; // The immediate parent
  authorId: string;
  username: string;
  isOurAccount: boolean;
  isGenerated?: boolean;
  text: string;
  createdAt: Date;
}

export interface InstagramCommentThread {
  mediaId: string;
  rootCommentId: string; // The absolute root of the thread
  postContext: {
    movieTitle?: string;
    releaseYear?: number;
    tmdbId?: number;
    caption?: string;
    overview?: string;
  };
  messages: CommentMessage[];
  lastDxbmoviesReplyId?: string;
  automation_paused_until?: Date;
  commerceSessionId?: string;
  updatedAt: Date;
}

const COLLECTION_NAME = "instagram_comment_threads";

async function getCollection() {
  const client = await clientPromise;
  const db = client.db("dxbmovies");
  return db.collection<InstagramCommentThread>(COLLECTION_NAME);
}

/**
 * Resolves the absolute root comment ID given an immediate parent comment ID.
 * If the parent isn't found locally, it falls back to fetching from IG API (though we 
 * might not easily get its parent).
 */
export async function resolveThreadRoot(parentCommentId: string): Promise<string> {
  const col = await getCollection();
  
  // Try to find the parent in our known threads
  const existingThread = await col.findOne({ "messages.commentId": parentCommentId });
  if (existingThread) {
    return existingThread.rootCommentId;
  }
  
  // If not found locally, we'll try to fetch it from Instagram just to log,
  // but we must treat it as the root if we can't trace higher.
  console.log(`[db/comments] parentCommentId=${parentCommentId} not found locally. Treating as root.`);
  return parentCommentId; 
}

export async function appendCommentToThread(
  mediaId: string, 
  rootCommentId: string, 
  message: CommentMessage
): Promise<InstagramCommentThread> {
  const col = await getCollection();

  // Try to find an existing thread
  const existingThread = await col.findOne({ mediaId, rootCommentId });
  let thread: InstagramCommentThread;

  if (existingThread) {
    thread = existingThread;
  } else {
    // If this is a new thread, resolve the media context
    const mediaContext = await resolveInstagramMediaContext(mediaId);
    
    thread = {
      mediaId,
      rootCommentId,
      postContext: {
        movieTitle: mediaContext.movieTitle,
        releaseYear: mediaContext.releaseYear,
        tmdbId: mediaContext.tmdbId,
        caption: mediaContext.caption,
        overview: mediaContext.overview,
      },
      messages: [],
      updatedAt: new Date(),
    };
  }

  // Check if we already have this message (idempotency)
  const existingMsg = thread.messages.find(m => m.commentId === message.commentId);
  if (!existingMsg) {
    thread.messages.push(message);
  }
  
  thread.updatedAt = new Date();
  if (message.isOurAccount) {
    thread.lastDxbmoviesReplyId = message.commentId;
  }

  // Upsert
  await col.updateOne(
    { mediaId, rootCommentId },
    { $set: thread },
    { upsert: true }
  );

  return thread;
}

export async function setThreadPausedUntil(mediaId: string, rootCommentId: string, until?: Date) {
  const col = await getCollection();
  await col.updateOne(
    { mediaId, rootCommentId },
    { $set: { automation_paused_until: until } }
  );
}

export async function getDailyUserReplyCount(userId: string): Promise<number> {
  const col = await getCollection();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  // We count threads where DXBmovies replied to this user today.
  // A simple way is to count messages authored by us where the parent was authored by them, 
  // but tracking per-user exactly is easier by checking the thread's messages.
  // Actually, let's just query `messages` where `isOurAccount === true` and `createdAt >= startOfDay`.
  // Wait, we need to know how many times we replied TO THIS USER.
  // If we just check how many times this user has received a reply:
  // We can search messages where `authorId === userId` and `createdAt >= startOfDay`, and see if we replied to them.
  // To keep it simple and performant, we'll track this loosely or just use an aggregation.
  const threads = await col.find({
    "messages.authorId": userId,
    "messages.createdAt": { $gte: startOfDay }
  }).toArray();

  let count = 0;
  for (const t of threads) {
    for (const m of t.messages) {
      if (m.isOurAccount && m.createdAt >= startOfDay) {
        // Did we reply to this user specifically?
        const parent = t.messages.find(pm => pm.commentId === m.parentCommentId);
        if (parent?.authorId === userId || (!m.parentCommentId && t.messages[0]?.authorId === userId)) {
          count++;
        }
      }
    }
  }
  return count;
}
