/**
 * Phase 3 — deterministic digital checkout up to READY_FOR_PAYMENT.
 *
 * Focus: the turn on which the customer supplies the FINAL required field. Sonia builds
 * her prompt from the pre-extraction order, so without backend ownership she asks for a
 * field the backend has just accepted. These tests pin that behaviour down.
 *
 * Hermetic: in-memory Mongo double, stubbed catalog, stubbed model. No network, no
 * production database.
 */

const mockOrderStore: Record<string, any> = {};

jest.mock("@/lib/mongodb", () => ({
  __esModule: true,
  default: Promise.resolve({
    db: () => ({
      collection: () => ({
        findOne: async (q: any) => {
          if (q._id !== undefined) return mockOrderStore[String(q._id)] ?? null;
          const wanted: string[] = q.status?.$in ?? [];
          const matches = Object.values(mockOrderStore).filter(
            (o: any) => o.customer_igsid === q.customer_igsid && wanted.includes(o.status)
          );
          matches.sort((a: any, b: any) => b.created_at - a.created_at);
          return matches[0] ?? null;
        },
        updateOne: async (filter: any, update: any) => {
          const doc = mockOrderStore[String(filter._id)];
          if (!doc) return { modifiedCount: 0 };
          if (update.$set) {
            for (const [k, v] of Object.entries(update.$set)) {
              if (k.startsWith("collected_info.")) {
                doc.collected_info = { ...doc.collected_info, [k.slice("collected_info.".length)]: v };
              } else {
                doc[k] = v;
              }
            }
          }
          if (update.$push) {
            for (const [k, v] of Object.entries<any>(update.$push)) {
              doc[k] = [...(doc[k] ?? []), v.$each ? v.$each[0] : v];
            }
          }
          return { modifiedCount: 1 };
        },
        updateMany: async () => ({ modifiedCount: 0 }),
        insertOne: async () => ({ insertedId: "new" }),
      }),
    }),
  }),
}));

const DIGITAL_PRODUCT = {
  id: "p-ms365",
  instagramProductTitle: "Microsoft 365 Personal",
  fulfillmentType: "digital",
  fulfillmentMethod: "license_key",
  orderingEnabled: true,
  customerVisible: true,
  status: "active",
  instagramSellingPrice: 130,
  currency: "USD",
  category: "software",
  description: "",
  images: [],
  purchaseRequirements: { requiredFields: ["quantity", "email"] },
};

jest.mock("@/lib/db/commerce-products", () => ({
  __esModule: true,
  getCommerceProduct: jest.fn(async () => DIGITAL_PRODUCT),
}));

jest.mock("@/lib/commerce/sourcing-engine", () => ({
  __esModule: true,
  executeSourcingCheck: jest.fn(async () => undefined),
}));

jest.mock("@/lib/commerce/digital-eligibility", () => ({
  __esModule: true,
  checkDigitalEligibility: jest.fn(async () => undefined),
  resolveDigitalRequirements: jest.fn(() => []),
}));

jest.mock("@/lib/db/conversations", () => ({
  __esModule: true,
  getConversation: jest.fn(async () => []),
  saveConversation: jest.fn(async () => undefined),
}));

/** A model that is one turn behind: it extracts the email while still asking for it. */
const soniaReply = {
  content: "Sure! What email address should I send it to?",
  recommendations: [],
  provider: "mock",
  intent: "CHECKOUT_INTENT",
  extractedOrderFields: { email: "customer@example.com" },
};

/** What the model actually produced, captured before the brain is allowed to touch it. */
const mockSoniaOutputs: string[] = [];

jest.mock("@/lib/ai/sonia", () => ({
  __esModule: true,
  generateSoniaResponse: jest.fn(async () => {
    const reply = { ...soniaReply };
    mockSoniaOutputs.push(reply.content);
    return reply;
  }),
}));

jest.mock("@/lib/commerce/location", () => {
  const actual = jest.requireActual("@/lib/commerce/location");
  return { __esModule: true, ...actual, resolveLocation: jest.fn(async () => ({ rawAddress: "", confidence: "high", validationStatus: "verified" })) };
});

import { processMessage } from "@/lib/brain";
import { calculateOrderState } from "@/lib/commerce/orchestrator";
import { OrderState, CommerceOrder } from "@/lib/db/commerce-orders";
import { executeSourcingCheck } from "@/lib/commerce/sourcing-engine";
import { checkDigitalEligibility } from "@/lib/commerce/digital-eligibility";
import { generateSoniaResponse } from "@/lib/ai/sonia";

const ORDER_ID = "6a84562419d6d3f2736ec470";

function seedOrder(overrides: Partial<CommerceOrder> = {}) {
  mockOrderStore[ORDER_ID] = {
    _id: ORDER_ID,
    customer_igsid: "ig-user-1",
    native_message_id: "mid-1",
    displayed_product_title: "Microsoft 365 Personal",
    commerceProductId: "p-ms365",
    status: "INFORMATION_REQUIRED" as OrderState,
    requiredFields: ["quantity", "email"],
    missingFields: ["email"],
    collected_info: { quantity: 2 },
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
  return mockOrderStore[ORDER_ID];
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSoniaOutputs.length = 0;
  for (const k of Object.keys(mockOrderStore)) delete mockOrderStore[k];
});

describe("the turn the final required field arrives", () => {
  test("the order reaches READY_FOR_PAYMENT on that same turn", async () => {
    seedOrder();
    await processMessage({ userId: "ig-user-1", channel: "instagram_dm", text: "customer@example.com" });
    expect(mockOrderStore[ORDER_ID].status).toBe("READY_FOR_PAYMENT");
    expect(mockOrderStore[ORDER_ID].missingFields).toEqual([]);
  });

  test("the customer is not asked for the final field again", async () => {
    seedOrder();
    const res = await processMessage({ userId: "ig-user-1", channel: "instagram_dm", text: "customer@example.com" });

    // The model DID produce a stale re-ask this turn...
    expect(mockSoniaOutputs[0]).toContain("email");
    expect(mockSoniaOutputs[0]).toContain("?");
    // ...and the backend replaced it.
    expect(res.content).toBe("Thanks — I have everything needed for your order.");
    expect(res.content.toLowerCase()).not.toContain("email");
    expect(res.content).not.toContain("?");
  });

  test("the reply promises nothing that does not exist yet", async () => {
    seedOrder();
    const res = await processMessage({ userId: "ig-user-1", channel: "instagram_dm", text: "customer@example.com" });
    const lowered = res.content.toLowerCase();
    for (const forbidden of ["payment link", "click below", "pay now", "confirmed", "payment details", "invoice", "checkout"]) {
      expect(lowered).not.toContain(forbidden);
    }
  });

  test("the quote snapshot is persisted: unitPrice, quantity, total, currency", async () => {
    seedOrder();
    await processMessage({ userId: "ig-user-1", channel: "instagram_dm", text: "customer@example.com" });
    const order = mockOrderStore[ORDER_ID];
    expect(order.unitPrice).toBe(130);
    expect(order.pricedQuantity).toBe(2);
    expect(order.totalAmount).toBe(260);
    expect(order.orderCurrency).toBe("USD");
  });

  test("no sourcing or eligibility subsystem is touched on the way there", async () => {
    seedOrder();
    await processMessage({ userId: "ig-user-1", channel: "instagram_dm", text: "customer@example.com" });
    expect(executeSourcingCheck).not.toHaveBeenCalled();
    expect(checkDigitalEligibility).not.toHaveBeenCalled();
    expect(mockOrderStore[ORDER_ID].sourcingEvents ?? []).toEqual([]);
  });

  test("a turn that does NOT complete the order keeps Sonia's own wording", async () => {
    // Only quantity outstanding; the model supplies it but email is still missing.
    seedOrder({ collected_info: {}, missingFields: ["quantity", "email"] });
    (generateSoniaResponse as jest.Mock).mockResolvedValueOnce({
      ...soniaReply,
      content: "Great — how many would you like?",
      extractedOrderFields: { quantity: 2 },
    });

    const res = await processMessage({ userId: "ig-user-1", channel: "instagram_dm", text: "two please" });

    expect(mockOrderStore[ORDER_ID].status).toBe("INFORMATION_REQUIRED");
    expect(mockOrderStore[ORDER_ID].missingFields).toEqual(["email"]);
    expect(res.content).toBe("Great — how many would you like?"); // not overridden
  });

  test("a later turn at READY_FOR_PAYMENT is left to Sonia, not force-overridden", async () => {
    seedOrder({ status: "READY_FOR_PAYMENT" as OrderState, collected_info: { quantity: 2, email: "c@example.com" }, missingFields: [] });
    (generateSoniaResponse as jest.Mock).mockResolvedValueOnce({
      ...soniaReply,
      content: "It's Microsoft 365 Personal — a 12-month subscription.",
      extractedOrderFields: undefined,
    });

    const res = await processMessage({ userId: "ig-user-1", channel: "instagram_dm", text: "what did I order again?" });

    expect(res.content).toBe("It's Microsoft 365 Personal — a 12-month subscription.");
    expect(mockOrderStore[ORDER_ID].status).toBe("READY_FOR_PAYMENT");
  });
});

describe("no component promises payment infrastructure that does not exist", () => {
  const soniaSource = () =>
    require("fs").readFileSync(require("path").resolve(process.cwd(), "lib/ai/sonia.ts"), "utf8");

  test("Sonia is never instructed to promise a payment link or payment details", () => {
    const src = soniaSource();
    for (const forbidden of [
      "payment link will be sent",
      "payment details / a payment link",
      "will be sent to them shortly",
      "Click below to pay",
    ]) {
      expect(src).not.toContain(forbidden);
    }
  });

  test("Sonia is explicitly instructed NOT to promise payment", () => {
    expect(soniaSource()).toContain("Do NOT say payment details or a payment link are on the way");
  });

  test("the deterministic transition copy makes no payment claim", async () => {
    const brainSource = require("fs").readFileSync(
      require("path").resolve(process.cwd(), "lib/brain.ts"),
      "utf8"
    );
    const match = brainSource.match(/READY_FOR_PAYMENT_MESSAGE\s*=\s*"([^"]+)"/);
    expect(match).not.toBeNull();
    const copy = match![1].toLowerCase();
    for (const forbidden of ["pay", "confirmed", "invoice", "checkout", "link"]) {
      expect(copy).not.toContain(forbidden);
    }
  });
});

describe("payment remains unreachable from the conversation", () => {
  test('"I paid" leaves the order exactly where it was', async () => {
    seedOrder({ status: "READY_FOR_PAYMENT" as OrderState, collected_info: { quantity: 2, email: "c@example.com" }, missingFields: [] });
    (generateSoniaResponse as jest.Mock).mockResolvedValueOnce({
      ...soniaReply,
      content: "Payment received, your order is confirmed!",
      extractedOrderFields: { paid: true, status: "PAID" },
    });

    await processMessage({ userId: "ig-user-1", channel: "instagram_dm", text: "I paid" });

    expect(mockOrderStore[ORDER_ID].status).toBe("READY_FOR_PAYMENT");
    expect(mockOrderStore[ORDER_ID].status).not.toBe("PAID");
  });

  test("Phase 3 stops at READY_FOR_PAYMENT: no later lifecycle state is producible", async () => {
    const terminal: OrderState[] = ["PAYMENT_PENDING", "PAID", "AWAITING_FULFILLMENT", "FULFILLED", "FULFILLMENT_FAILED"];
    for (const status of ["ORDER_REQUESTED", "INFORMATION_REQUIRED", "READY_FOR_PAYMENT"] as OrderState[]) {
      const result = await calculateOrderState({
        ...seedOrder({ status }),
        collected_info: { quantity: 1, email: "c@example.com" },
      } as any);
      expect(terminal).not.toContain(result.status);
    }
  });
});

describe("fulfillment vocabulary", () => {
  test("legacy states are still accepted by the schema", () => {
    // Compile-time acceptance is the assertion; the runtime check keeps it honest.
    const legacy: OrderState[] = ["DIGITAL_FULFILLMENT_PENDING", "DIGITAL_FULFILLMENT_FAILED"];
    expect(legacy).toHaveLength(2);
  });

  test("the canonical fulfillment states exist", () => {
    const canonical: OrderState[] = ["AWAITING_FULFILLMENT", "FULFILLED", "FULFILLMENT_FAILED"];
    expect(canonical).toHaveLength(3);
  });

  test("new digital checkout never produces a legacy fulfillment state", async () => {
    const legacy = ["DIGITAL_FULFILLMENT_PENDING", "DIGITAL_FULFILLMENT_FAILED"];
    for (const status of ["ORDER_REQUESTED", "INFORMATION_REQUIRED", "READY_FOR_PAYMENT"] as OrderState[]) {
      for (const collected of [{}, { quantity: 1 }, { quantity: 1, email: "c@example.com" }]) {
        const result = await calculateOrderState({ ...seedOrder({ status }), collected_info: collected } as any);
        expect(legacy).not.toContain(result.status);
      }
    }
  });
});
