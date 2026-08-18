import { NextResponse } from "next/server";
import { getPendingCommentJobs, markJobComplete } from "@/lib/db/comment-jobs";
import { appendCommentToThread } from "@/lib/db/comments";
import { saveShadowLog } from "@/lib/db/shadow-logs";
import { generateSoniaResponse } from "@/lib/ai/sonia";
import { replyToComment } from "@/lib/instagram/client";
import type { AIChatMessage } from "@/lib/ai-router";
import clientPromise from "@/lib/mongodb";
import { getCommentMode } from "@/lib/instagram/comment-mode";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const jobs = await getPendingCommentJobs();
    
    if (jobs.length === 0) {
      return NextResponse.json({ success: true, processed: 0 });
    }

    // Send guard, checked immediately before any publishing can happen. This is the
    // last line of defence: it also neutralises jobs queued before automation was
    // switched off, webhook redeliveries, and scheduler/worker races.
    if (getCommentMode() !== "live") {
      for (const job of jobs) {
        await markJobComplete(job._id!.toString(), "skipped");
      }
      console.log(`[cron/process-comments] public replies disabled (mode=${getCommentMode()}) — skipped ${jobs.length} queued job(s), nothing published`);
      return NextResponse.json({ success: true, processed: 0, skipped: jobs.length, mode: getCommentMode() });
    }

    const client = await clientPromise;
    const db = client.db("dxbmovies");
    const threadsCol = db.collection("instagram_comment_threads");

    let processedCount = 0;

    for (const job of jobs) {
      const thread = await threadsCol.findOne({ rootCommentId: job.rootCommentId });
      if (!thread) {
        await markJobComplete(job._id!.toString(), "failed");
        continue;
      }

      // 1. Evidence Mode Context
      const tier1 = `Tier 1 (DXBmovies Map): Movie: ${thread.postContext.movieTitle || "Unknown"} (${thread.postContext.releaseYear || "Unknown"}).`;
      const tier2 = `Tier 2 (TMDB): Overview: ${thread.postContext.overview || "None provided"}`;
      // Tier 3 could be pulled from a separate collection, for now placeholder
      const tier3 = `Tier 3 (Internal Notes): None at this time.`;

      let contextualMessage = `[Comment on Post: "${thread.postContext.caption}"]\n\n`;
      contextualMessage += `EVIDENCE MODE CONTEXT:\n${tier1}\n${tier2}\n${tier3}\n\n`;
      contextualMessage += `[System Note: You may confidently state facts from Tiers 1-2. Any other lore, plot details, internal notes, or interpretations (Tiers 3-4) MUST be framed as your interpretation or theory, not established fact. Use phrases like "In the film..." or "According to the lore..." when citing facts.]\n\n`;
      contextualMessage += `[System Note: CRITICAL RULE - Do NOT end your response with a question. State your opinion or fact, but do not artificially invite further replies.]\n\n`;

      if (job.intent === "medium_delay") {
         contextualMessage += `[System Note: This is a general top-level opinion. ONLY reply if you have something highly contextually useful or natural to add. If not, you MUST return an empty string to ignore it. Do NOT reply with generic acknowledgements.]\n\n`;
      }

      // Find the specific comment triggering this
      const triggeringMessage = thread.messages.find((m: any) => m.commentId === job.commentId);
      if (!triggeringMessage) {
        await markJobComplete(job._id!.toString(), "failed");
        continue;
      }

      // 1.5 Idempotency Check (Duplicate reply prevention)
      const alreadyReplied = thread.messages.some((m: any) => m.parentCommentId === job.commentId && m.isOurAccount);
      if (alreadyReplied) {
        console.log(`[cron/process-comments] idempotency_skip already_replied_to=${job.commentId}`);
        await markJobComplete(job._id!.toString(), "completed");
        processedCount++;
        continue;
      }

      contextualMessage += `User Comment: ${triggeringMessage.text}`;

      // Build history up to the triggering message
      const messageHistory: AIChatMessage[] = [];
      for (const m of thread.messages) {
        if (m.createdAt > triggeringMessage.createdAt) continue;
        if (m.commentId === job.commentId) {
          messageHistory.push({ role: "user", content: contextualMessage });
        } else {
          messageHistory.push({
            role: m.isOurAccount ? "assistant" : "user",
            content: m.isOurAccount ? m.text : `[${m.username}] ${m.text}`,
          });
        }
      }

      // 2. Generate Response
      const response = await generateSoniaResponse({
        channel: "instagram_comment",
        anonId: "thread_" + job.rootCommentId,
        messageHistory,
      });

      const willReply = !!(response.content && response.content.trim() !== "");
      
      const mode = getCommentMode();

      const nowMs = Date.now();
      const shadowLogData = {
          commentId: job.commentId,
          mediaId: job.mediaId,
          rootCommentId: job.rootCommentId,
          userIdentifier: triggeringMessage.authorId,
          rawText: triggeringMessage.text,
          decision: willReply ? "reply" : "ignore",
          intent: job.intent,
          scheduledDelayMs: job.scheduledFor.getTime() - job.createdAt.getTime(),
          processedDelayMs: nowMs - job.scheduledFor.getTime(),
          wouldReply: willReply,
          generatedResponse: response.content,
          evidenceUsed: ["Tier 1", "Tier 2"], // Simplified logging
          model: "gemini-flash-latest",
          createdAt: new Date(),
      };

      if (mode === "shadow") {
        await saveShadowLog(shadowLogData);
        await markJobComplete(job._id!.toString(), "completed");
        processedCount++;
        continue;
      }

      if (willReply) {
        // Re-check immediately before publishing: generating the reply took time, and
        // automation may have been switched off in the meantime.
        if (getCommentMode() !== "live") {
          console.log(`[cron/process-comments] mode changed during generation — refusing to publish commentId=${job.commentId}`);
          await markJobComplete(job._id!.toString(), "skipped");
          continue;
        }
        const result = await replyToComment(job.commentId, response.content!);
        if (result.success) {
          await appendCommentToThread(job.mediaId, job.rootCommentId, {
            commentId: result.messageId || `reply_${Date.now()}`,
            parentCommentId: job.commentId,
            authorId: "dxbmovies_account_id", // We need the actual account ID here, but for appending, it's not strictly necessary as isOurAccount handles the logic. We will use a placeholder or read it from env.
            username: "dxbmovies",
            isOurAccount: true,
            isGenerated: true, // Mark it as Sonia-generated
            text: response.content!,
            createdAt: new Date(),
          });
        }
      } else {
        // Log ignoring
        if (mode === "live") {
           await saveShadowLog({
             ...shadowLogData,
             decision: "ignore",
             wouldReply: false
           });
        }
      }

      await markJobComplete(job._id!.toString(), "completed");
      processedCount++;
    }

    return NextResponse.json({ success: true, processed: processedCount });
  } catch (error: any) {
    console.error("[cron/process-comments] error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
