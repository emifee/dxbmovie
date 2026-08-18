/**
 * Public Instagram comment automation is paused.
 *
 * Comment quality/context handling is not ready for autonomous public posting — a real
 * comment about religion and relationships received an unrelated movie recommendation.
 * Ingestion must continue; publishing must not. These tests cover both the scheduler
 * gate and the worker send guard, because either alone can be bypassed (jobs queued
 * before the switch, webhook redelivery, races).
 */

const mockThreads: Record<string, any> = {};
const mockJobs: any[] = [];
const scheduled: any[] = [];
const published: Array<{ commentId: string; text: string }> = [];

jest.mock("@/lib/mongodb", () => ({
  __esModule: true,
  default: Promise.resolve({ db: () => ({ collection: () => ({ findOne: async () => null, updateOne: async () => ({}) }) }) }),
}));

jest.mock("@/lib/db/comments", () => ({
  __esModule: true,
  resolveThreadRoot: jest.fn(async (id: string) => id),
  appendCommentToThread: jest.fn(async (mediaId: string, rootId: string, msg: any) => {
    const key = `${mediaId}:${rootId}`;
    mockThreads[key] = mockThreads[key] || { messages: [], postContext: {} };
    mockThreads[key].messages.push(msg);
    return mockThreads[key];
  }),
  setThreadPausedUntil: jest.fn(async () => undefined),
  getDailyUserReplyCount: jest.fn(async () => 0),
}));

jest.mock("@/lib/db/comment-jobs", () => ({
  __esModule: true,
  scheduleCommentJob: jest.fn(async (job: any) => { scheduled.push(job); return "job-1"; }),
  getPendingCommentJobs: jest.fn(async () => mockJobs),
  markJobComplete: jest.fn(async (id: string, status: string) => { mockJobs.forEach((j) => { if (String(j._id) === id) j.status = status; }); }),
}));

jest.mock("@/lib/instagram/client", () => ({
  __esModule: true,
  sendTextMessage: jest.fn(async () => ({ success: true })),
  markSeen: jest.fn(async () => true),
  setTyping: jest.fn(async () => true),
  replyToComment: jest.fn(async (commentId: string, text: string) => { published.push({ commentId, text }); return { success: true, messageId: "r1" }; }),
}));

jest.mock("@/lib/brain", () => ({ __esModule: true, processMessage: jest.fn(async () => ({ content: "hi", recommendations: [], provider: "mock" })) }));
jest.mock("@/lib/instagram/renderer", () => ({ __esModule: true, renderPresentation: jest.fn(async () => undefined) }));
jest.mock("@/lib/ai/sonia", () => ({ __esModule: true, generateSoniaResponse: jest.fn(async () => ({ content: "A great film!", recommendations: [], provider: "mock" })) }));
jest.mock("@/lib/db/shadow-logs", () => ({ __esModule: true, saveShadowLog: jest.fn(async () => undefined) }));

import { handleNormalizedEvent } from "@/lib/instagram/handlers";
import { replyToComment } from "@/lib/instagram/client";
import { scheduleCommentJob } from "@/lib/db/comment-jobs";
import { appendCommentToThread } from "@/lib/db/comments";
import { getCommentMode, publicRepliesEnabled } from "@/lib/instagram/comment-mode";

const comment = (id = "c1") => ({
  event_type: "instagram.comment.created" as const,
  event_id: id,
  sender_id: "commenter-1",
  sender_username: "someone",
  instagram_account_id: "dxbmovies",
  media_id: "media-1",
  text: "What movie is this? Also, marriage is hard.",
  payload: {},
});

beforeEach(() => {
  jest.clearAllMocks();
  for (const k of Object.keys(mockThreads)) delete mockThreads[k];
  mockJobs.length = 0;
  scheduled.length = 0;
  published.length = 0;
  delete process.env.SONIA_COMMENT_MODE;
});

describe("mode resolution fails closed", () => {
  test.each([undefined, "", "  ", "shadow", "LIVEISH", "nonsense", "on", "true"])("%p is not live", (v) => {
    if (v === undefined) delete process.env.SONIA_COMMENT_MODE; else process.env.SONIA_COMMENT_MODE = v as string;
    expect(publicRepliesEnabled()).toBe(false);
  });

  test('only an explicit "live" enables public replies', () => {
    process.env.SONIA_COMMENT_MODE = "live";
    expect(getCommentMode()).toBe("live");
    expect(publicRepliesEnabled()).toBe(true);
  });

  test('"off" is recognised explicitly', () => {
    process.env.SONIA_COMMENT_MODE = "off";
    expect(getCommentMode()).toBe("off");
  });
});

describe("scheduler gate", () => {
  test("a comment is still ingested and stored while automation is off", async () => {
    process.env.SONIA_COMMENT_MODE = "off";
    await handleNormalizedEvent(comment());

    expect(appendCommentToThread).toHaveBeenCalledTimes(1);   // ingestion continues
    expect(mockThreads["media-1:c1"].messages).toHaveLength(1);
  });

  test("no reply job is scheduled while automation is off", async () => {
    process.env.SONIA_COMMENT_MODE = "off";
    await handleNormalizedEvent(comment());

    expect(scheduleCommentJob).not.toHaveBeenCalled();
    expect(scheduled).toHaveLength(0);
    expect(replyToComment).not.toHaveBeenCalled();
  });

  test("nothing is published even on webhook redelivery", async () => {
    process.env.SONIA_COMMENT_MODE = "off";
    await handleNormalizedEvent(comment());
    await handleNormalizedEvent(comment()); // redelivery
    await handleNormalizedEvent(comment("c2"));

    expect(scheduleCommentJob).not.toHaveBeenCalled();
    expect(published).toHaveLength(0);
  });

  test("jobs ARE scheduled when automation is explicitly live (control)", async () => {
    process.env.SONIA_COMMENT_MODE = "live";
    await handleNormalizedEvent(comment());
    expect(scheduleCommentJob).toHaveBeenCalledTimes(1);
  });
});

describe("worker send guard (defense in depth)", () => {
  async function runWorker() {
    const { GET } = await import("@/app/api/cron/process-comments/route");
    return (await GET(new Request("http://localhost/api/cron/process-comments"))).json();
  }

  test("a job queued BEFORE the switch can never publish", async () => {
    mockJobs.push({ _id: "j1", commentId: "c1", mediaId: "media-1", rootCommentId: "c1", intent: "immediate", status: "pending", scheduledFor: new Date(Date.now() - 1000), createdAt: new Date(Date.now() - 60000) });
    process.env.SONIA_COMMENT_MODE = "off";

    const body = await runWorker();

    expect(replyToComment).not.toHaveBeenCalled();
    expect(published).toHaveLength(0);
    expect(body.skipped).toBe(1);
    expect(mockJobs[0].status).toBe("skipped");
  });

  test("shadow mode also publishes nothing", async () => {
    mockJobs.push({ _id: "j2", commentId: "c9", mediaId: "media-1", rootCommentId: "c9", intent: "immediate", status: "pending", scheduledFor: new Date(Date.now() - 1000), createdAt: new Date(Date.now() - 60000) });
    process.env.SONIA_COMMENT_MODE = "shadow";

    await runWorker();

    expect(replyToComment).not.toHaveBeenCalled();
    expect(mockJobs[0].status).toBe("skipped");
  });

  test("underlying comment records are not deleted by skipping", async () => {
    process.env.SONIA_COMMENT_MODE = "off";
    await handleNormalizedEvent(comment());
    mockJobs.push({ _id: "j3", commentId: "c1", mediaId: "media-1", rootCommentId: "c1", intent: "immediate", status: "pending", scheduledFor: new Date(Date.now() - 1000), createdAt: new Date() });
    await runWorker();

    expect(mockThreads["media-1:c1"].messages).toHaveLength(1); // still there
    expect(mockJobs[0].status).toBe("skipped");
  });
});

describe("DMs are unaffected", () => {
  test("a DM is still processed and rendered while comments are off", async () => {
    process.env.SONIA_COMMENT_MODE = "off";
    const { processMessage } = await import("@/lib/brain");
    const { renderPresentation } = await import("@/lib/instagram/renderer");
    const { markSeen, setTyping } = await import("@/lib/instagram/client");

    await handleNormalizedEvent({
      event_type: "instagram.dm.received",
      event_id: "dm-1",
      sender_id: "user-1",
      instagram_account_id: "dxbmovies",
      text: "recommend me a movie",
      payload: {},
    });

    expect(processMessage).toHaveBeenCalledTimes(1);
    expect(renderPresentation).toHaveBeenCalledTimes(1);
    expect(markSeen).toHaveBeenCalledTimes(1);
    expect(setTyping).toHaveBeenCalledTimes(2); // on, then off in finally
    expect(replyToComment).not.toHaveBeenCalled();
  });
});
