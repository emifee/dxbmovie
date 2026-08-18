/**
 * Integration regression suite — real application modules against a REAL MongoDB.
 *
 * Skipped unless TEST_MONGODB_URI is provided. Launch it through the guarded runner,
 * which refuses to point this at production:
 *
 *   mongod --port 27018 --dbpath /tmp/dxb-test-db &
 *   node scripts/test-regression-suite.ts
 *
 * Assertions target BACKEND STATE, never Sonia's wording: the backend owns business
 * truth and model phrasing is not a contract. The conversational layer (real LLM calls)
 * is opt-in via RUN_LLM_TESTS=1.
 */

import type { CommerceProduct } from "@/lib/db/commerce-products";

const INTEGRATION = !!process.env.TEST_MONGODB_URI;
const describeIntegration = INTEGRATION ? describe : describe.skip;

const TEST_IGSID = "regression_user_" + Date.now();
const TEST_MEDIA_ID = "regression_media_" + Date.now();
const createdProductIds: string[] = [];

/** Instagram and Telegram calls are intercepted; nothing leaves the process. */
const transport = {
  markSeen: false,
  typingOn: false,
  typingOff: false,
  telegramMessages: [] as string[],
};

let realFetch: typeof fetch;
const LIVE_LLM = process.env.RUN_LLM_TESTS === "1";
let llmCallCount = 0;

function resetTransport() {
  transport.markSeen = false;
  transport.typingOn = false;
  transport.typingOff = false;
  transport.telegramMessages = [];
}

describeIntegration("commerce integration flow", () => {
  let db: any;
  let mongo: any;
  let api: any;

  beforeAll(async () => {
    realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: any, init?: any) => {
      const url = String(input);
      if (url.includes("graph.instagram.com")) {
        if (typeof init?.body === "string") {
          const body = JSON.parse(init.body);
          if (body.sender_action === "mark_seen") transport.markSeen = true;
          if (body.sender_action === "typing_on") transport.typingOn = true;
          if (body.sender_action === "typing_off") transport.typingOff = true;
        }
        return new Response(JSON.stringify({ id: "test", message_id: "test" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("api.telegram.org")) {
        if (typeof init?.body === "string") transport.telegramMessages.push(JSON.parse(init.body).text);
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Unless the conversational tests are explicitly enabled, the LLM providers are
      // stubbed so the default run is deterministic, free, and offline.
      if (!LIVE_LLM && (url.includes("api.openai.com") || url.includes("api.groq.com") || url.includes("generativelanguage.googleapis.com"))) {
        llmCallCount++;
        return new Response(
          JSON.stringify({
            id: "stub",
            choices: [
              {
                index: 0,
                finish_reason: "stop",
                message: {
                  role: "assistant",
                  content: JSON.stringify({
                    intent: "MOVIE_DISCUSSION",
                    message: "Sure — happy to help with that.",
                    recommendations: [],
                    memories: [],
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (url.includes("api.themoviedb.org")) {
        return new Response(JSON.stringify({ results: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.includes("127.0.0.1") || url.includes("localhost")) return realFetch(input, init);

      // Anything else would be an unintended external call from a test run.
      throw new Error(`[integration suite] blocked unexpected outbound request to ${url}`);
    }) as typeof fetch;

    const { MongoClient } = await import("mongodb");
    mongo = new MongoClient(process.env.MONGODB_URI as string);
    await mongo.connect();
    db = mongo.db("dxbmovies");

    api = {
      ...(await import("@/lib/db/commerce-orders")),
      ...(await import("@/lib/db/commerce-products")),
      ...(await import("@/lib/instagram/handlers")),
      ...(await import("@/lib/commerce/telegram")),
    };

    await cleanup();
  }, 60000);

  afterAll(async () => {
    if (!INTEGRATION) return;
    await cleanup();
    await mongo?.close();
    globalThis.fetch = realFetch;
  }, 60000);

  async function cleanup() {
    await db.collection("commerce_orders").deleteMany({ customer_igsid: { $in: [TEST_IGSID, "regression_commenter"] } });
    await db.collection("conversations").deleteMany({ externalUserId: TEST_IGSID });
    await db.collection("commerce_products").deleteMany({ id: { $in: createdProductIds } });
    await db.collection("instagram_comment_threads").deleteMany({ mediaId: TEST_MEDIA_ID });
    await db.collection("instagram_comment_jobs").deleteMany({ mediaId: TEST_MEDIA_ID });
  }

  /**
   * Creates a product through the SAME path production uses, so the `id` contract is
   * identical. The previous suite inserted raw documents with no `id`, so
   * getCommerceProduct() returned null and every "digital" test silently exercised the
   * physical fallback instead.
   */
  async function makeProduct(overrides: Partial<CommerceProduct> = {}): Promise<CommerceProduct> {
    const id = `regression-${Math.random().toString(36).slice(2, 10)}`;
    createdProductIds.push(id);
    return api.upsertCommerceProduct({
      id,
      instagramProductTitle: `Regression Digital Product ${id}`,
      fulfillmentType: "digital",
      fulfillmentMethod: "license_key",
      orderingEnabled: true,
      customerVisible: true,
      resaleAuthorized: true,
      status: "active",
      instagramSellingPrice: 130,
      currency: "USD",
      category: "software",
      description: "regression fixture",
      images: [],
      purchaseRequirements: { requiredFields: ["quantity", "email"] },
      ...overrides,
    });
  }

  async function makeOrder(productId: string | undefined, title: string): Promise<string> {
    const id = await api.createCommerceOrder({
      customer_igsid: TEST_IGSID,
      native_message_id: "mid_" + Math.random().toString(36).slice(2),
      displayed_product_title: title,
      status: "ORDER_REQUESTED",
      collected_info: {},
      ...(productId ? { commerceProductId: productId } : {}),
    });
    return id.toString();
  }

  describe("fixture identity contract", () => {
    test("test products are resolvable by getCommerceProduct(id), exactly like production", async () => {
      const product = await makeProduct();
      expect(product.id).toBeTruthy();
      await expect(api.getCommerceProduct(product.id)).resolves.not.toBeNull();
    });
  });

  describe("product identity invariant", () => {
    test("an order with no commerceProductId fails closed and collects nothing", async () => {
      const orderId = await makeOrder(undefined, "Totally Unmatched Product");
      await api.runOrderOrchestrator(orderId);
      const order = await api.getCommerceOrder(orderId);

      expect(order.status).toBe("PRODUCT_LINKAGE_REQUIRED");
      expect(order.requiredFields).toEqual([]);
      expect(order.requiredFields).not.toContain("shippingAddress");
      expect(order.requiredFields).not.toContain("phone");
      expect(order.sourcingEvents ?? []).toEqual([]);
    });

    test("an order whose commerceProductId does not resolve fails closed", async () => {
      const orderId = await makeOrder("does-not-exist-in-catalog", "Ghost Product");
      await api.runOrderOrchestrator(orderId);
      const order = await api.getCommerceOrder(orderId);
      expect(order.status).toBe("PRODUCT_LINKAGE_REQUIRED");
    });
  });

  describe("digital lifecycle (A–J)", () => {
    test("A. disabled digital product is rejected before any question", async () => {
      const disabled = await makeProduct({ orderingEnabled: false });
      const orderId = await makeOrder(disabled.id, disabled.instagramProductTitle);
      await api.runOrderOrchestrator(orderId);
      const order = await api.getCommerceOrder(orderId);

      expect(order.status).toBe("ORDER_NOT_AVAILABLE");
      expect(order.requiredFields).toEqual([]);
    });

    test("B–J. enabled digital product runs the whole flow to READY_FOR_PAYMENT", async () => {
      const product = await makeProduct();
      const orderId = await makeOrder(product.id, product.instagramProductTitle);

      // B: collection begins, from purchaseRequirements only
      await api.runOrderOrchestrator(orderId);
      let order = await api.getCommerceOrder(orderId);
      expect(order.status).toBe("INFORMATION_REQUIRED");
      expect(order.requiredFields).toEqual(["quantity", "email"]);
      expect(order.requiredFields).not.toContain("shippingAddress"); // G
      expect(order.requiredFields).not.toContain("phone"); // H

      // C: quantity supplied, email outstanding
      await api.updateOrderCollectedInfo(orderId, { quantity: 2 });
      await api.runOrderOrchestrator(orderId);
      order = await api.getCommerceOrder(orderId);
      expect(order.missingFields).toEqual(["email"]);
      expect(order.status).toBe("INFORMATION_REQUIRED");

      // D/E/F: email completes it, priced correctly
      await api.updateOrderCollectedInfo(orderId, { email: "customer@example.com" });
      await api.runOrderOrchestrator(orderId);
      order = await api.getCommerceOrder(orderId);
      expect(order.missingFields).toEqual([]);
      expect(order.status).toBe("READY_FOR_PAYMENT");
      expect(order.unitPrice).toBe(130);
      expect(order.pricedQuantity).toBe(2);
      expect(order.totalAmount).toBe(260);
      expect(order.orderCurrency).toBe("USD");

      // The lifecycle stops here, and never in the legacy vocabulary.
      expect(["DIGITAL_FULFILLMENT_PENDING", "DIGITAL_FULFILLMENT_FAILED"]).not.toContain(order.status);

      // I/J: dormant subsystems stayed dormant
      const events = (order.sourcingEvents ?? []).map((e: any) => e.event);
      expect(events).toEqual([]);
      expect(events.some((e: string) => e.startsWith("SUPPLIER_"))).toBe(false);
      expect(events.some((e: string) => e.startsWith("DIGITAL_ELIGIBILITY"))).toBe(false);

      // K/L: no amount of orchestration invents payment
      for (let i = 0; i < 3; i++) await api.runOrderOrchestrator(orderId);
      order = await api.getCommerceOrder(orderId);
      expect(order.status).toBe("READY_FOR_PAYMENT");
      expect(order.status).not.toBe("PAID");
    }, 60000);

    // M. PAID -> AWAITING_FULFILLMENT + Telegram notification.
    // Not asserted: no payment gateway and no fulfillment tail exist yet (Phase 3+).
    test.todo("M. PAID digital order -> AWAITING_FULFILLMENT + Telegram (blocked: no payment integration)");
  });

  describe("an unavailable order does not block a different new order", () => {
    test("a newer order for a different product becomes the active one", async () => {
      const disabled = await makeProduct({ orderingEnabled: false });
      const blockedId = await makeOrder(disabled.id, disabled.instagramProductTitle);
      await api.runOrderOrchestrator(blockedId);
      expect((await api.getCommerceOrder(blockedId)).status).toBe("ORDER_NOT_AVAILABLE");

      const usable = await makeProduct();
      const newId = await makeOrder(usable.id, usable.instagramProductTitle);
      await api.runOrderOrchestrator(newId);

      const active = await api.getActiveOrderForCustomer(TEST_IGSID);
      expect(active._id.toString()).toBe(newId);
      expect(active.status).toBe("INFORMATION_REQUIRED");
    }, 60000);
  });

  describe("order concurrency", () => {
    test("a prior unidentified order is marked superseded, not silently orphaned", async () => {
      const first = await makeOrder(undefined, "Unidentifiable A");
      await api.runOrderOrchestrator(first);
      await makeOrder(undefined, "Unidentifiable B");

      const old = await api.getCommerceOrder(first);
      const events = (old.sourcingEvents ?? []).map((e: any) => e.event);
      expect(events).toContain("SUPERSEDED_BY_NEW_ORDER");
      expect(old.status).toBe("PRODUCT_LINKAGE_REQUIRED"); // still recoverable by admin
    });
  });

  describe("instagram transport (must keep working)", () => {
    test("markSeen, typing on, and typing off in finally", async () => {
      resetTransport();
      try {
        await api.handleNormalizedEvent({
          event_type: "instagram.dm.received",
          event_id: "regression_dm_" + Date.now(),
          sender_id: TEST_IGSID,
          sender_username: "regression",
          instagram_account_id: "regression_account",
          text: "hello",
          payload: {},
        });
      } catch {
        /* transport assertions below still hold */
      }
      expect(transport.markSeen).toBe(true);
      expect(transport.typingOn).toBe(true);
      expect(transport.typingOff).toBe(true);
    }, 120000);
  });

  describe("instagram comments (must stay separate from commerce)", () => {
    test("public automation OFF: the comment is ingested but nothing is scheduled or published", async () => {
      const previous = process.env.SONIA_COMMENT_MODE;
      process.env.SONIA_COMMENT_MODE = "off";
      const commentId = "regression_off_" + Date.now();
      try {
        await api.handleNormalizedEvent({
          event_type: "instagram.comment.created" as const,
          event_id: commentId,
          sender_id: "regression_commenter",
          sender_username: "regression",
          instagram_account_id: "regression_account",
          media_id: TEST_MEDIA_ID,
          text: "What movie is this?",
          payload: {},
        });

        const jobs = await db.collection("instagram_comment_jobs").find({ commentId }).toArray();
        expect(jobs).toHaveLength(0); // nothing queued

        const threads = await db.collection("instagram_comment_threads").find({ mediaId: TEST_MEDIA_ID }).toArray();
        expect(threads.length).toBeGreaterThan(0); // but ingestion still happened
      } finally {
        if (previous === undefined) delete process.env.SONIA_COMMENT_MODE;
        else process.env.SONIA_COMMENT_MODE = previous;
      }
    }, 60000);

    test("public automation LIVE: a question schedules one job, duplicates are ignored, and no order is created", async () => {
      const previousMode = process.env.SONIA_COMMENT_MODE;
      process.env.SONIA_COMMENT_MODE = "live";
      try {
        const commentId = "regression_comment_" + Date.now();
        const event = {
          event_type: "instagram.comment.created" as const,
          event_id: commentId,
          sender_id: "regression_commenter",
          sender_username: "regression",
          instagram_account_id: "regression_account",
          media_id: TEST_MEDIA_ID,
          text: "What movie is this?",
          payload: {},
        };

        await api.handleNormalizedEvent(event);
        let jobs = await db.collection("instagram_comment_jobs").find({ commentId }).toArray();
        expect(jobs).toHaveLength(1);
        expect(jobs[0].intent).toBe("immediate");

        await api.handleNormalizedEvent(event); // redelivery
        jobs = await db.collection("instagram_comment_jobs").find({ commentId }).toArray();
        expect(jobs).toHaveLength(1);

        // One thread for THIS root comment (other tests on the same media add their own).
        const threads = await db.collection("instagram_comment_threads").find({ mediaId: TEST_MEDIA_ID, rootCommentId: commentId }).toArray();
        expect(threads).toHaveLength(1);

        const orders = await db.collection("commerce_orders").countDocuments({ customer_igsid: "regression_commenter" });
        expect(orders).toBe(0);
      } finally {
        if (previousMode === undefined) delete process.env.SONIA_COMMENT_MODE;
        else process.env.SONIA_COMMENT_MODE = previousMode;
      }
    }, 60000);
  });

  describe("harness hermeticity", () => {
    test("the default run makes no live LLM calls", () => {
      if (LIVE_LLM) return; // conversational mode intentionally calls out
      expect(llmCallCount).toBeGreaterThan(0); // the brain WAS exercised...
      // ...but every provider request was served by the stub above, never the network.
    });
  });

  describe("telegram transport (must keep working)", () => {
    test("a notification reaches the Telegram API verbatim", async () => {
      resetTransport();
      await api.sendTelegramNotification("regression probe", false);

      if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_ADMIN_CHAT_ID) {
        expect(transport.telegramMessages).toEqual(["regression probe"]);
      } else {
        expect(transport.telegramMessages).toEqual([]); // no credentials: fails safe
      }
    });
  });

  const describeLlm = process.env.RUN_LLM_TESTS === "1" ? describe : describe.skip;
  describeLlm("conversational layer (live LLM)", () => {
    test("K. a customer claiming payment cannot create PAID", async () => {
      const { processMessage } = await import("@/lib/brain");
      const product = await makeProduct();
      const orderId = await makeOrder(product.id, product.instagramProductTitle);
      await api.updateOrderCollectedInfo(orderId, { quantity: 1, email: "c@example.com" });
      await api.runOrderOrchestrator(orderId);

      const res = await processMessage({ userId: TEST_IGSID, channel: "instagram_dm", text: "I paid, confirmed right?" });

      const order = await api.getCommerceOrder(orderId);
      expect(order.status).not.toBe("PAID");
      expect(res.content).not.toContain("extractedOrderFields");
    }, 120000);

    test("unresolved identity: nothing the customer volunteers is collected", async () => {
      const { processMessage } = await import("@/lib/brain");
      const orderId = await makeOrder(undefined, "Mystery Item");
      await api.runOrderOrchestrator(orderId);

      const res = await processMessage({
        userId: TEST_IGSID,
        channel: "instagram_dm",
        text: "I want 3 of these, ship to Dubai Marina, my number is 0551994544",
      });

      const order = await api.getCommerceOrder(orderId);
      expect(Object.keys(order.collected_info ?? {})).toEqual([]);
      expect(res.content).toContain("checking the product details");
    }, 120000);
  });
});
