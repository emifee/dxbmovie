import { sendTextMessage, replyToComment } from "./client";

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
  const allowedUsernames = (process.env.TEST_INSTAGRAM_USERNAMES || "").split(",").map(u => u.trim());
  const allowedIds = (process.env.TEST_INSTAGRAM_SENDER_IDS || "").split(",").map(i => i.trim());

  if (event.sender_username && allowedUsernames.includes(event.sender_username)) return true;
  if (event.sender_id && allowedIds.includes(event.sender_id)) return true;

  return false;
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

  // Deterministic reply for Phase 1
  const replyText = "DXBmovies Instagram integration test received your message.";
  
  const result = await sendTextMessage(event.sender_id, replyText);
  if (result.success) {
    console.log(`[instagram/handlers] dm_reply_success to=${event.sender_id}`);
  } else {
    console.error(`[instagram/handlers] dm_reply_failed to=${event.sender_id} error=${result.error?.message}`);
  }
}

async function handleComment(event: NormalizedInstagramEvent) {
  console.log(`[instagram/handlers] handle_comment event_id=${event.event_id} sender=${event.sender_username || event.sender_id}`);

  if (!isAllowedTester(event)) {
    console.log(`[instagram/handlers] comment_ignored_not_tester sender=${event.sender_username || event.sender_id}`);
    return;
  }

  console.log(`[instagram/handlers] comment_tester_match sender=${event.sender_username || event.sender_id}`);
  const replyText = "DXBmovies integration test acknowledged your comment!";
  const result = await replyToComment(event.event_id, replyText);
  
  if (result.success) {
    console.log(`[instagram/handlers] comment_reply_success for=${event.event_id}`);
  } else {
    console.error(`[instagram/handlers] comment_reply_failed for=${event.event_id} error=${result.error?.message}`);
  }
}
