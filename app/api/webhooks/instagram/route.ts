import { NextResponse } from "next/server";
import { createHmac } from "crypto";
import clientPromise from "@/lib/mongodb";
import { handleNormalizedEvent, NormalizedInstagramEvent } from "@/lib/instagram/handlers";

// ---------------------------------------------------------------------------
// GET — Meta Webhook Verification
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN;

  if (!verifyToken) {
    console.error("[webhook/instagram] webhook_verification_error: META_WEBHOOK_VERIFY_TOKEN not configured");
    return new Response("Server misconfigured", { status: 500 });
  }

  if (mode === "subscribe" && token === verifyToken) {
    console.log("[webhook/instagram] webhook_verified challenge_accepted");
    // Meta expects the challenge echoed back as plain text, not JSON
    return new Response(challenge, { status: 200 });
  }

  console.warn("[webhook/instagram] webhook_verification_failed mode=" + mode);
  return new Response("Forbidden", { status: 403 });
}

// ---------------------------------------------------------------------------
// POST — Receive Instagram Webhook Events
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  const rawBody = await request.text();

  // 1. Validate webhook signature
  const signature = request.headers.get("x-hub-signature-256");
  if (!verifySignature(rawBody, signature)) {
    console.warn("[webhook/instagram] signature_invalid");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }
  console.log("[webhook/instagram] webhook_received signature_valid");

  // 2. Parse the event payload
  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    console.error("[webhook/instagram] parse_error: invalid JSON");
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // 3. Return 200 immediately — Meta requires a fast response.
  //    Process messaging events asynchronously (fire-and-forget).
  //    We do NOT await this; if it fails the event is still logged.
  processWebhookEvents(body).catch((err) => {
    console.error("[webhook/instagram] processing_error", err.message);
  });

  return NextResponse.json({ status: "EVENT_RECEIVED" }, { status: 200 });
}

// ---------------------------------------------------------------------------
// Signature Verification
// ---------------------------------------------------------------------------

function verifySignature(rawBody: string, signatureHeader: string | null): boolean {
  const appSecret = process.env.META_APP_SECRET;

  // If no app secret is configured, reject everything.
  if (!appSecret) {
    console.error("[webhook/instagram] META_APP_SECRET not configured — rejecting");
    return false;
  }

  // Meta may not send the header on the verification GET, but should on POST.
  // If missing on POST, reject.
  if (!signatureHeader) {
    return false;
  }

  const expectedSignature =
    "sha256=" + createHmac("sha256", appSecret).update(rawBody).digest("hex");

  // Constant-time comparison to prevent timing attacks
  if (expectedSignature.length !== signatureHeader.length) {
    return false;
  }

  const a = Buffer.from(expectedSignature);
  const b = Buffer.from(signatureHeader);
  return a.length === b.length && createHmac("sha256", appSecret).update(rawBody).digest("hex") === signatureHeader.replace("sha256=", "");
}

// ---------------------------------------------------------------------------
// Event Processing & Normalization
// ---------------------------------------------------------------------------

async function processWebhookEvents(body: any) {
  // Instagram webhooks use "instagram" as the object type
  if (body.object !== "instagram") {
    console.log(`[webhook/instagram] ignored_event object=${body.object}`);
    return;
  }

  const entries = body.entry;
  if (!Array.isArray(entries)) {
    console.log("[webhook/instagram] no_entries");
    return;
  }

  const client = await clientPromise;
  const db = client.db("dxbmovies");
  const eventsCol = db.collection("instagram_webhook_events");

  for (const entry of entries) {
    const instagramAccountId = entry.id;

    // Handle Messaging Events (DMs)
    if (Array.isArray(entry.messaging)) {
      for (const event of entry.messaging) {
        await handleRawDMEvent(event, instagramAccountId, eventsCol);
      }
    }

    // Handle Feed Events (Comments)
    if (Array.isArray(entry.changes)) {
      for (const change of entry.changes) {
        if (change.field === "comments") {
          await handleRawCommentEvent(change.value, instagramAccountId, eventsCol);
        }
      }
    }
  }
}

async function handleRawDMEvent(event: any, accountId: string, eventsCol: any) {
  const senderId = event.sender?.id;
  const messageObj = event.message;

  if (!senderId || !messageObj || !messageObj.mid) {
    return;
  }

  const messageId = messageObj.mid;
  const isEcho = !!messageObj.is_echo;
  
  if (isEcho) {
    console.log(`[webhook/instagram] echo_message_skipped messageId=${messageId}`);
    return;
  }

  const normalized: NormalizedInstagramEvent = {
    event_type: "instagram.dm.received",
    event_id: messageId,
    sender_id: senderId,
    instagram_account_id: accountId,
    text: messageObj.text || "",
    payload: event,
  };

  await persistAndProcess(normalized, eventsCol);
}

async function handleRawCommentEvent(value: any, accountId: string, eventsCol: any) {
  if (!value || !value.id || !value.from) {
    return;
  }

  const commentId = value.id;
  const senderId = value.from.id;
  const senderUsername = value.from.username;
  
  // Ignore comments made by the page itself
  if (senderId === accountId) {
    console.log(`[webhook/instagram] self_comment_skipped commentId=${commentId}`);
    return;
  }

  const normalized: NormalizedInstagramEvent = {
    event_type: "instagram.comment.created",
    event_id: commentId,
    sender_id: senderId,
    sender_username: senderUsername,
    instagram_account_id: accountId,
    media_id: value.media?.id,
    parent_comment_id: value.parent_id,
    text: value.text || "",
    payload: value,
  };

  await persistAndProcess(normalized, eventsCol);
}

async function persistAndProcess(normalized: NormalizedInstagramEvent, eventsCol: any) {
  // Idempotency check
  const existing = await eventsCol.findOne({ event_id: normalized.event_id });
  if (existing) {
    console.log(`[webhook/instagram] duplicate_ignored event_id=${normalized.event_id} type=${normalized.event_type}`);
    return;
  }

  const eventDoc = {
    ...normalized,
    received_at: new Date(),
    processed_at: null as Date | null,
    processing_status: "received",
    error_code: null as string | null,
  };

  await eventsCol.insertOne(eventDoc);

  const startTime = Date.now();
  try {
    // Pass to handlers layer
    await handleNormalizedEvent(normalized);
    
    await eventsCol.updateOne(
      { event_id: normalized.event_id },
      { 
        $set: { 
          processing_status: "success", 
          processed_at: new Date(),
          latency: Date.now() - startTime
        } 
      }
    );
  } catch (err: any) {
    console.error(`[webhook/instagram] handler_error event_id=${normalized.event_id}`, err);
    await eventsCol.updateOne(
      { event_id: normalized.event_id },
      { 
        $set: { 
          processing_status: "failed", 
          processed_at: new Date(),
          error_code: err.message || "unknown_error",
          latency: Date.now() - startTime
        } 
      }
    );
  }
}
