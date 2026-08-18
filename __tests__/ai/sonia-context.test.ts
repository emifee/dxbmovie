/**
 * Sonia's grounding: business identity, catalog authority, and returning-customer memory.
 *
 * These assert what goes INTO the system prompt and what comes out of the deterministic
 * safeguards — never the model's wording. No live LLM, no database, no network.
 */

const mockDb: Record<string, any> = {
  userPreferences: null,
  watchlists: [],
  reactions: [],
  commerce_orders: [],
};

function cursor(rows: any[]): any {
  const self: any = {
    project: () => self,
    sort: () => self,
    limit: () => self,
    toArray: async () => rows,
  };
  return self;
}

jest.mock("@/lib/mongodb", () => ({
  __esModule: true,
  default: Promise.resolve({
    db: () => ({
      collection: (name: string) => ({
        findOne: async () => (name === "userPreferences" ? mockDb.userPreferences : null),
        updateOne: async () => ({ modifiedCount: 1 }),
        find: () => cursor(mockDb[name] ?? []),
      }),
    }),
  }),
}));

const mockPrompts: string[] = [];
const mockReplies: string[] = [];

jest.mock("@/lib/ai-router", () => ({
  __esModule: true,
  routeChat: jest.fn(async (messages: any[]) => {
    mockPrompts.push(messages.find((m) => m.role === "system")?.content ?? "");
    return { text: mockReplies.shift() ?? JSON.stringify({ intent: "MOVIE_DISCUSSION", message: "Sure." }), provider: "openai" };
  }),
}));

jest.mock("@/lib/db/commerce-orders", () => ({
  __esModule: true,
  getActiveOrderForCustomer: jest.fn(async () => null),
}));

jest.mock("@/lib/commerce/tools", () => ({ __esModule: true, executeCommerceTool: jest.fn(async () => ({})) }));
jest.mock("@/lib/db/commerce-sessions", () => ({ __esModule: true, getCommerceSession: jest.fn(async () => null) }));

import { generateSoniaResponse } from "@/lib/ai/sonia";

const realFetch = globalThis.fetch;
let tmdbResults: any[] = [];

beforeEach(() => {
  jest.clearAllMocks();
  mockPrompts.length = 0;
  mockReplies.length = 0;
  mockDb.userPreferences = null;
  mockDb.watchlists = [];
  mockDb.reactions = [];
  mockDb.commerce_orders = [];
  tmdbResults = [];
  process.env.TMDB_API_KEY = "test-key";
  globalThis.fetch = (async (input: any) => {
    if (String(input).includes("themoviedb.org")) {
      return new Response(JSON.stringify({ results: tmdbResults }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    throw new Error("unexpected outbound request: " + String(input));
  }) as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = realFetch;
});

const ask = (text: string, userId = "ig-1") =>
  generateSoniaResponse({ channel: "instagram_dm", userId, messageHistory: [{ role: "user", content: text }] });

const GREEN_MILE = { id: 497, title: "The Green Mile", media_type: "movie", poster_path: "/gm.jpg", vote_average: 8.5, release_date: "1999-12-10", overview: "" };

describe("business identity — DXBmovies sells digital products", () => {
  test("the prompt never claims we only discuss movies", async () => {
    await ask("Do you sell products?");
    const prompt = mockPrompts[0];
    expect(prompt).not.toContain("You ONLY discuss movies");
    expect(prompt).not.toContain("You do not provide general AI assistance outside of entertainment.");
  });

  test("the prompt states we sell digital products and forbids denying it", async () => {
    await ask("Do you sell products?");
    const prompt = mockPrompts[0];
    expect(prompt).toContain("ALSO SELLS a small, curated selection of DIGITAL PRODUCTS");
    expect(prompt).toContain("I don't sell products");
    expect(prompt).toContain("I focus exclusively on movies and TV shows");
    expect(prompt).toMatch(/NEVER say any of the following, because they are FALSE/);
  });

  test("the catalog, not the model, decides what we sell", async () => {
    await ask("Do you have Microsoft 365?");
    const prompt = mockPrompts[0];
    expect(prompt).toContain("search_catalog");
    expect(prompt).toContain("THE CATALOG IS THE ONLY SOURCE OF TRUTH");
    expect(prompt).toMatch(/NEVER state that a product is available, priced, or orderable/);
  });

  test("no specific product is hardcoded into the prompt", async () => {
    await ask("what do you sell?");
    expect(mockPrompts[0]).not.toMatch(/Microsoft 365/i);
  });
});

describe("poster flow", () => {
  test("recommendation context + 'show me the poster' yields an image presentation", async () => {
    mockDb.userPreferences = { userId: "ig-1", activeMediaContext: { title: "The Green Mile", tmdbId: 497, mediaType: "movie" } };
    mockReplies.push(JSON.stringify({ intent: "MOVIE_DISCUSSION", message: "Sure!" }));

    const res = await ask("show me the poster");

    expect(res.presentation).toBeTruthy();
    expect(res.presentation.type).toBe("image");
    expect(res.presentation.tmdbId).toBe(497);
  });

  test("the active title is put in the prompt so 'it' is resolvable", async () => {
    mockDb.userPreferences = { userId: "ig-1", activeMediaContext: { title: "The Green Mile", tmdbId: 497, mediaType: "movie" } };
    await ask("can i see it");
    expect(mockPrompts[0]).toContain("ACTIVE MEDIA CONTEXT");
    expect(mockPrompts[0]).toContain("The Green Mile");
  });

  test("a named title resolves directly, with no prior context", async () => {
    tmdbResults = [GREEN_MILE];
    mockReplies.push(JSON.stringify({ intent: "MOVIE_DISCUSSION", message: "Here you go" }));

    const res = await ask("Can I see Green Mile poster");

    expect(res.presentation?.type).toBe("image");
    expect(res.presentation.tmdbId).toBe(497);
  });

  test("a named title is not overwritten by a different active context", async () => {
    mockDb.userPreferences = { userId: "ig-1", activeMediaContext: { title: "Dune", tmdbId: 438631, mediaType: "movie" } };
    tmdbResults = [GREEN_MILE];
    mockReplies.push(JSON.stringify({ intent: "MOVIE_DISCUSSION", message: "ok", presentation: { type: "image", tmdbId: 111, mediaType: "movie" } }));

    const res = await ask("Can I see Green Mile poster");

    expect(res.presentation.tmdbId).toBe(497); // the title asked for, not Dune, not the model's guess
  });

  test("an unresolvable title returns words, never silence", async () => {
    tmdbResults = []; // TMDB finds nothing
    mockReplies.push(JSON.stringify({ intent: "MOVIE_DISCUSSION", message: "" }));

    const res = await ask("Can I see Zzzqqx poster");

    expect(res.presentation).toBeUndefined();
    expect(res.content.trim().length).toBeGreaterThan(0);
    expect(res.content).toContain("Zzzqqx");
  });

  test('a "text-based AI" refusal is never returned to the customer', async () => {
    mockDb.userPreferences = { userId: "ig-1", activeMediaContext: { title: "The Green Mile", tmdbId: 497, mediaType: "movie" } };
    mockReplies.push(JSON.stringify({ intent: "MOVIE_DISCUSSION", message: "I'm a text-based AI and can't share images." }));

    const res = await ask("show me the poster");

    expect(res.content.toLowerCase()).not.toContain("text-based ai");
    expect(res.presentation?.type).toBe("image");
  });

  test("the base prompt still forbids claiming to be text-only", async () => {
    await ask("hello");
    expect(mockPrompts[0]).toContain('NEVER claim you are a "text-based AI"');
  });
});

describe("returning-customer memory", () => {
  test("a returning customer's prior visit and taste are in the profile", async () => {
    mockDb.userPreferences = {
      userId: "ig-1",
      lastInteractionAt: new Date(Date.now() - 3 * 86400000).toISOString(),
      genres: ["Action"],
      memories: ["prefers subtitles over dubs"],
      activeMediaContext: { title: "Heat", tmdbId: 949, mediaType: "movie" },
    };
    mockDb.reactions = [{ reaction: "like", movieTitle: "Mad Max: Fury Road", movieGenres: ["Action"] }];

    await ask("hey");
    const prompt = mockPrompts[0];

    expect(prompt).toContain("RETURNING CUSTOMER");
    expect(prompt).toContain("3 days ago");
    expect(prompt).toContain("Action");
    expect(prompt).toContain("prefers subtitles over dubs");
    expect(prompt).toContain("Mad Max: Fury Road");
  });

  test("the last title discussed carries across conversations", async () => {
    mockDb.userPreferences = {
      userId: "ig-1",
      lastInteractionAt: new Date(Date.now() - 2 * 86400000).toISOString(),
      activeMediaContext: { title: "Heat", tmdbId: 949, mediaType: "movie" },
    };
    await ask("what was that film again");
    expect(mockPrompts[0]).toContain('Last title you discussed with them: "Heat"');
  });

  test("prior commerce history is visible, without any order status", async () => {
    mockDb.userPreferences = { userId: "ig-1", lastInteractionAt: new Date(Date.now() - 86400000).toISOString() };
    mockDb.commerce_orders = [
      { displayed_product_title: "Microsoft 365 Personal", status: "READY_FOR_PAYMENT", created_at: new Date() },
      { displayed_product_title: "Microsoft 365 Personal", status: "ORDER_NOT_AVAILABLE", created_at: new Date() },
    ];

    await ask("hi again");
    const prompt = mockPrompts[0];

    expect(prompt).toContain("PRIOR ORDER HISTORY: 2 previous order(s)");
    expect(prompt).toContain("Microsoft 365 Personal");
    // The status of a past order must not be leaked as fact into the profile block.
    const profileBlock = prompt.slice(prompt.indexOf("PRIOR ORDER HISTORY"));
    expect(profileBlock).not.toContain("READY_FOR_PAYMENT");
    expect(profileBlock).not.toContain("ORDER_NOT_AVAILABLE");
    expect(prompt).toMatch(/must NOT state, guess, or imply the status/);
  });

  test("history alone never fabricates an active order", async () => {
    mockDb.userPreferences = { userId: "ig-1", lastInteractionAt: new Date(Date.now() - 86400000).toISOString() };
    mockDb.commerce_orders = [{ displayed_product_title: "Microsoft 365 Personal", status: "PAID", created_at: new Date() }];

    await ask("where is my order");
    const prompt = mockPrompts[0];

    expect(prompt).toContain("PRIOR ORDER HISTORY");
    expect(prompt).not.toContain("ACTIVE ORDER —");
    expect(prompt).not.toContain("CONVERSATIONAL STRATEGY & ORDER STATE");
  });

  test("a brand-new customer gets no returning-customer or history claims", async () => {
    await ask("hello", "brand-new-user");
    const prompt = mockPrompts[0];

    expect(prompt).not.toContain("RETURNING CUSTOMER");
    expect(prompt).not.toContain("PRIOR ORDER HISTORY");
    expect(prompt).not.toContain("ACTIVE MEDIA CONTEXT");
  });
});
