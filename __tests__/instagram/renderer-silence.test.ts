/**
 * The renderer must never leave a customer with silence.
 *
 * Regression: when a presentation resolved to no asset (or Meta rejected the send), the
 * image branch fell through without sending anything. With deliveryMode "text_then_media"
 * that left a dangling "Here it is 👇" and no image; with "media_only" it left nothing at all.
 */

const sent = { texts: [] as string[], images: [] as string[], mediaShares: [] as string[] };

jest.mock("@/lib/instagram/client", () => ({
  __esModule: true,
  sendTextMessage: jest.fn(async (_id: string, text: string) => { sent.texts.push(text); return { success: true }; }),
  sendImageMessage: jest.fn(async (_id: string, url: string) => { sent.images.push(url); return { success: true, messageId: "m1" }; }),
  sendMediaShare: jest.fn(async (_id: string, mid: string) => { sent.mediaShares.push(mid); return { success: true, messageId: "m2" }; }),
  sendQuickReplies: jest.fn(async () => ({ success: true })),
  sendGenericTemplate: jest.fn(async () => ({ success: true })),
}));

jest.mock("@/lib/mongodb", () => ({
  __esModule: true,
  default: Promise.resolve({ db: () => ({ collection: () => ({ findOne: async () => null }) }) }),
}));

jest.mock("@/lib/db/commerce-products", () => ({ __esModule: true, getCommerceProduct: jest.fn(async () => null) }));

import { renderPresentation } from "@/lib/instagram/renderer";
import { sendImageMessage } from "@/lib/instagram/client";

const realFetch = globalThis.fetch;
let posterPath: string | null = "/poster.jpg";

beforeEach(() => {
  jest.clearAllMocks();
  sent.texts = []; sent.images = []; sent.mediaShares = [];
  posterPath = "/poster.jpg";
  process.env.TMDB_API_KEY = "test-key";
  globalThis.fetch = (async (input: any) => {
    if (String(input).includes("themoviedb.org")) {
      return new Response(JSON.stringify(posterPath ? { poster_path: posterPath } : {}), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }
    throw new Error("unexpected outbound request");
  }) as typeof fetch;
});

afterAll(() => { globalThis.fetch = realFetch; });

const imagePresentation = (deliveryMode: string) => ({
  content: "Here it is 👇",
  presentation: { type: "image", tmdbId: 497, mediaType: "movie", deliveryMode },
});

describe("happy path", () => {
  test("a resolvable poster is sent as an image, with the text once", async () => {
    await renderPresentation("user-1", imagePresentation("text_then_media"));
    expect(sent.images).toEqual(["https://image.tmdb.org/t/p/w500/poster.jpg"]);
    expect(sent.texts).toEqual(["Here it is 👇"]);
  });
});

describe("never silent", () => {
  test("unresolvable asset with text already sent still explains itself", async () => {
    posterPath = null; // TMDB has no poster
    await renderPresentation("user-1", imagePresentation("text_then_media"));
    expect(sent.images).toHaveLength(0);
    expect(sent.texts).toHaveLength(2);
    expect(sent.texts[1].toLowerCase()).toContain("couldn't load");
  });

  test("unresolvable asset with media_only still sends something", async () => {
    posterPath = null;
    await renderPresentation("user-1", imagePresentation("media_only"));
    expect(sent.texts).toHaveLength(1);
    expect(sent.texts[0].trim().length).toBeGreaterThan(0);
  });

  test("a presentation with no text at all still gets a reply out", async () => {
    posterPath = null;
    await renderPresentation("user-1", { content: "", presentation: { type: "image", tmdbId: 497, deliveryMode: "media_only" } });
    expect(sent.texts).toHaveLength(1);
    expect(sent.texts[0]).toMatch(/couldn't pull that image/i);
  });

  test("a Meta send rejection is reported to the customer", async () => {
    (sendImageMessage as jest.Mock).mockResolvedValueOnce({ success: false, error: { code: 100 } });
    await renderPresentation("user-1", imagePresentation("text_then_media"));
    expect(sent.texts).toHaveLength(2);
    expect(sent.texts[1].toLowerCase()).toContain("couldn't load");
  });

  test("an unexpected throw still produces a reply", async () => {
    (sendImageMessage as jest.Mock).mockImplementationOnce(() => { throw new Error("boom"); });
    await renderPresentation("user-1", { content: "", presentation: { type: "image", tmdbId: 497, deliveryMode: "media_only" } });
    expect(sent.texts.length).toBeGreaterThanOrEqual(1);
  });

  test("plain text with no presentation is unaffected", async () => {
    await renderPresentation("user-1", { content: "Just a normal reply." });
    expect(sent.texts).toEqual(["Just a normal reply."]);
    expect(sent.images).toHaveLength(0);
  });
});
