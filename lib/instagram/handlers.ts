import { sendTextMessage, replyToComment, setTyping, markSeen } from "./client";
import { renderPresentation } from "./renderer";
import { resolveThreadRoot, appendCommentToThread, setThreadPausedUntil, getDailyUserReplyCount } from "@/lib/db/comments";
import { scheduleCommentJob, CommentIntent } from "@/lib/db/comment-jobs";
import { processMessage } from "@/lib/brain";
import { getCommentMode } from "./comment-mode";

export interface NormalizedInstagramEvent {
  event_type: "instagram.dm.received" | "instagram.comment.created" | "instagram.unknown";
  event_id: string;
  sender_id: string;
  sender_username?: string;
  instagram_account_id: string;
  media_id?: string;
  parent_comment_id?: string;
  text: string;
  payload: any;
}

function isAllowedTester(event: NormalizedInstagramEvent): boolean {
  // Tester locks have been removed so the bot can respond to actual customers.
  return true;
}

export async function handleNormalizedEvent(event: NormalizedInstagramEvent) {
  if (event.event_type === "instagram.dm.received") {
    await handleDM(event);
  } else if (event.event_type === "instagram.comment.created") {
    await handleComment(event);
  } else {
    console.log(`[instagram/handlers] ignored_event_type type=${event.event_type} id=${event.event_id}`);
  }
}

async function handleDM(event: NormalizedInstagramEvent) {
  console.log(`[instagram/handlers] handle_dm event_id=${event.event_id} sender=${event.sender_id}`);
  
  if (!isAllowedTester(event)) {
    console.log(`[instagram/handlers] dm_ignored_not_tester sender=${event.sender_id}`);
    return;
  }

  try {
    await markSeen(event.sender_id);
    await setTyping(event.sender_id, true);

    const response = await processMessage({
      userId: event.sender_id,
      channel: "instagram_dm",
      text: event.text,
    });

    if (response.content?.trim() || response.presentation) {
      await renderPresentation(event.sender_id, response);
      console.log(`[instagram/handlers] dm_reply_rendered to=${event.sender_id}`);
    }

  } catch (err) {
    console.error(`[instagram/handlers] dm_processing_failed to=${event.sender_id}`, err);
  } finally {
    await setTyping(event.sender_id, false);
  }
}

async function handleComment(event: NormalizedInstagramEvent) {
  console.log(`[instagram/handlers] handle_comment event_id=${event.event_id} sender=${event.sender_username || event.sender_id}`);

  if (!isAllowedTester(event)) {
    console.log(`[instagram/handlers] comment_ignored_not_tester sender=${event.sender_username || event.sender_id}`);
    return;
  }

  try {
    if (!event.media_id) {
      console.log(`[instagram/handlers] ignored_no_media_id commentId=${event.event_id}`);
      return;
    }

    // 1. Resolve true root
    let rootCommentId = event.event_id;
    if (event.parent_comment_id) {
      rootCommentId = await resolveThreadRoot(event.parent_comment_id);
    }

    const isSelfComment = event.sender_id === event.instagram_account_id;

    // 2. Append incoming comment to thread
    const thread = await appendCommentToThread(event.media_id, rootCommentId, {
      commentId: event.event_id,
      parentCommentId: event.parent_comment_id,
      authorId: event.sender_id,
      username: event.sender_username || "unknown",
      isOurAccount: isSelfComment,
      text: event.text,
      createdAt: new Date(),
    });

    // 3. Human Takeover Check
    if (isSelfComment) {
      // Check if this was marked as generated. If we don't have it marked generated, assume human.
      // Note: Because of webhooks racing, we wait 1 second before checking, or just rely on the worker 
      // updating it right before. The worker `await`s the reply API, so it usually finishes first.
      const msg = thread.messages.find(m => m.commentId === event.event_id);
      if (msg && !msg.isGenerated) {
        console.log(`[instagram/handlers] human_takeover_detected threadRoot=${rootCommentId}`);
        const until = new Date(Date.now() + 24 * 60 * 60 * 1000); // Pause for 24 hours
        await setThreadPausedUntil(event.media_id, rootCommentId, until);
      }
      return; // We never auto-reply to our own comments
    }

    // Check if thread is paused
    if (thread.automation_paused_until && thread.automation_paused_until > new Date()) {
      console.log(`[instagram/handlers] ignored_automation_paused threadRoot=${rootCommentId}`);
      return;
    }

    // 4. Argument Ceiling Check
    const soniaReplies = thread.messages.filter(m => m.isOurAccount && m.isGenerated).length;
    const limit = process.env.SONIA_THREAD_REPLY_LIMIT ? parseInt(process.env.SONIA_THREAD_REPLY_LIMIT) : 3;
    if (soniaReplies >= limit) {
      console.log(`[instagram/handlers] ignored_ceiling_reached threadRoot=${rootCommentId} replies=${soniaReplies}`);
      return;
    }

    // 4b. Public comment automation gate.
    // The comment is already persisted to its thread above (ingestion continues), but
    // while automation is not "live" we schedule nothing — no job, no public reply.
    const commentMode = getCommentMode();
    if (commentMode !== "live") {
      console.log(`[instagram/handlers] comment_automation_${commentMode} — ingested but no reply scheduled commentId=${event.event_id}`);
      return;
    }

    // 5. Participation Engine
    const lcText = event.text.toLowerCase();
    const isMention = lcText.includes("@dxbmovies");
    const isDirectQuestion = lcText.includes("?") || lcText.includes("what") || lcText.includes("who") || lcText.includes("where") || lcText.includes("how");
    const isIdentificationQuestion = lcText.includes("what movie") || lcText.includes("name of") || lcText.includes("which movie") || lcText.includes("title");
    
    // Evaluate if parent is our account
    let isReplyToUs = false;
    let isReplyToOtherUser = false;
    
    if (event.parent_comment_id) {
      const parentComment = thread.messages.find(m => m.commentId === event.parent_comment_id);
      if (parentComment) {
        if (parentComment.isOurAccount) {
          isReplyToUs = true;
        } else {
          isReplyToOtherUser = true;
        }
      }
    }

    let intent: CommentIntent | "ignore" | "evaluate_top_level_opinion" | "ignore_user_to_user" | "ignore_low_value" | "moderation" = "ignore";

    if (lcText.length < 3 || lcText === "lol" || lcText === "lmao" || /^[^\w\s]+$/.test(lcText)) {
      intent = "ignore_low_value";
    } else if (isIdentificationQuestion || isDirectQuestion) {
      intent = "immediate";
    } else if (isMention) {
      intent = "short_delay";
    } else if (isReplyToUs) {
      intent = "long_delay";
    } else if (isReplyToOtherUser) {
      intent = "ignore_user_to_user";
    } else if (!event.parent_comment_id) {
      intent = "medium_delay"; // Top-level opinion
    }

    if (["ignore", "ignore_low_value", "ignore_user_to_user", "moderation"].includes(intent)) {
      console.log(`[instagram/handlers] participation_decision=${intent} commentId=${event.event_id}`);
      return;
    }

    // 6. User Budget Check
    const dailyReplies = await getDailyUserReplyCount(event.sender_id);
    if (dailyReplies >= 5 && intent !== "immediate") {
      // Soft limit: allow immediate (factual queries) but ignore others if budget exceeded
      console.log(`[instagram/handlers] ignored_budget_exceeded sender=${event.sender_id} replies=${dailyReplies}`);
      return;
    }

    // 7. Schedule Job with Jitter
    let scheduledFor = new Date();
    const now = Date.now();
    
    switch (intent) {
      case "immediate":
        // 15 - 45 seconds
        scheduledFor = new Date(now + Math.floor(Math.random() * 30000) + 15000);
        break;
      case "short_delay":
        // 1 - 3 minutes
        scheduledFor = new Date(now + Math.floor(Math.random() * 120000) + 60000);
        break;
      case "medium_delay":
        // 3 - 8 minutes
        scheduledFor = new Date(now + Math.floor(Math.random() * 300000) + 180000);
        break;
      case "long_delay":
        // 5 - 12 minutes
        scheduledFor = new Date(now + Math.floor(Math.random() * 420000) + 300000);
        break;
    }

    // Fallback if intent is weirdly typed
    const finalIntent: CommentIntent = ["immediate", "short_delay", "medium_delay", "long_delay"].includes(intent as string) 
      ? (intent as CommentIntent) 
      : "medium_delay";

    await scheduleCommentJob({
      commentId: event.event_id,
      mediaId: event.media_id,
      rootCommentId,
      intent: finalIntent,
      scheduledFor,
    });

    console.log(`[instagram/handlers] scheduled_job intent=${finalIntent} commentId=${event.event_id} at=${scheduledFor.toISOString()}`);
    
  } catch (err) {
    console.error(`[instagram/handlers] comment_processing_failed for=${event.event_id}`, err);
  }
}
