/**
 * Phase 2 — Digital commerce regression set (handoff §22 items A–M).
 *
 * Hermetic: no production database, no live LLM, no network. The catalog, Mongo,
 * geocoding, Telegram, the physical sourcing engine and the digital eligibility
 * module are all doubled in-memory, which is what lets these run in CI.
 *
 * Assertions target BACKEND STATE, never Sonia's wording, because the backend owns
 * business truth and model phrasing is not a contract.
 */

const mockOrderStore: Record<string, any> = {};
const mockUpdates: Array<{ filter: any; update: any }> = [];

jest.mock("@/lib/mongodb", () => ({
  __esModule: true,
  default: Promise.resolve({
    db: () => ({
      collection: () => ({
        findOne: async (q: any) => mockOrderStore[String(q._id)] ?? null,
        updateOne: async (filter: any, update: any) => {
          mockUpdates.push({ filter, update });
          const doc = mockOrderStore[String(filter._id)];
          if (doc && update.$set) Object.assign(doc, update.$set);
          return { modifiedCount: 1 };
        },
        updateMany: async () => ({ modifiedCount: 0 }),
        insertOne: async () => ({ insertedId: "new" }),
      }),
    }),
  }),
}));

jest.mock("@/lib/db/commerce-products", () => ({
  __esModule: true,
  getCommerceProduct: jest.fn(),
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

jest.mock("@/lib/commerce/telegram", () => ({
  __esModule: true,
  sendTelegramNotification: jest.fn(async () => undefined),
}));

jest.mock("@/lib/commerce/location", () => {
  const actual = jest.requireActual("@/lib/commerce/location");
  return {
    __esModule: true,
    ...actual,
    resolveLocation: jest.fn(async (raw: any) => ({
      rawAddress: typeof raw === "string" ? raw : JSON.stringify(raw),
      countryCode: "AE",
      callingCode: "+971",
      confidence: "high",
      validationStatus: "verified",
      validationProvider: "google_geocoding",
    })),
  };
});

import * as fs from "fs";
import * as path from "path";
import { calculateOrderState } from "@/lib/commerce/orchestrator";
import { runOrderOrchestrator, CommerceOrder, OrderState } from "@/lib/db/commerce-orders";
import { getCommerceProduct } from "@/lib/db/commerce-products";
import { executeSourcingCheck } from "@/lib/commerce/sourcing-engine";
import { checkDigitalEligibility } from "@/lib/commerce/digital-eligibility";

const mockedGetProduct = getCommerceProduct as jest.MockedFunction<typeof getCommerceProduct>;
const mockedSourcing = executeSourcingCheck as jest.MockedFunction<any>;
const mockedEligibility = checkDigitalEligibility as jest.MockedFunction<any>;

/** Mirrors the real Microsoft 365 product document in production. */
function digitalProduct(overrides: any = {}): any {
  return {
    id: "p-ms365",
    instagramProductTitle: "Microsoft 365 Personal | 12-Month Subscription",
    fulfillmentType: "digital",
    fulfillmentMethod: "license_key",
    orderingEnabled: true,
    customerVisible: true,
    resaleAuthorized: true,
    status: "active",
    instagramSellingPrice: 130,
    currency: "USD",
    category: "software",
    description: "",
    images: [],
    purchaseRequirements: { requiredFields: ["quantity", "email"] },
    ...overrides,
  };
}

function makeOrder(overrides: Partial<CommerceOrder> = {}): CommerceOrder {
  return {
    customer_igsid: "ig-user-1",
    native_message_id: "mid-1",
    displayed_product_title: "Microsoft 365 Personal | 12-Month Subscription",
    status: "ORDER_REQUESTED" as OrderState,
    commerceProductId: "p-ms365",
    collected_info: {},
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  } as CommerceOrder;
}

beforeEach(() => {
  jest.clearAllMocks();
  for (const k of Object.keys(mockOrderStore)) delete mockOrderStore[k];
  mockUpdates.length = 0;
});

describe("A–B. admin on/off switch", () => {
  test("A. disabled digital product is rejected immediately, before any question", async () => {
    mockedGetProduct.mockResolvedValue(digitalProduct({ orderingEnabled: false }));
    const result = await calculateOrderState(makeOrder());
    expect(result.status).toBe("ORDER_NOT_AVAILABLE");
    expect(result.requiredFields).toEqual([]);
    expect(result.missingFields).toEqual([]);
  });

  test("B. enabled digital product begins information collection", async () => {
    mockedGetProduct.mockResolvedValue(digitalProduct());
    const result = await calculateOrderState(makeOrder());
    expect(result.status).toBe("INFORMATION_REQUIRED");
    expect(result.requiredFields).toEqual(["quantity", "email"]);
    expect(result.missingFields).toEqual(["quantity", "email"]);
  });
});

describe("C–F. requirements come from purchaseRequirements", () => {
  test("C. quantity supplied, email still missing", async () => {
    mockedGetProduct.mockResolvedValue(digitalProduct());
    const result = await calculateOrderState(makeOrder({ collected_info: { quantity: 1 } as any }));
    expect(result.missingFields).toEqual(["email"]);
    expect(result.missingFields).not.toContain("quantity");
    expect(result.status).toBe("INFORMATION_REQUIRED");
  });

  test("C2. an invalid email does not satisfy the requirement", async () => {
    mockedGetProduct.mockResolvedValue(digitalProduct());
    const result = await calculateOrderState(
      makeOrder({ collected_info: { quantity: 1, email: "not-an-email" } as any })
    );
    expect(result.missingFields).toEqual(["email"]);
    expect(result.fieldResolutions.email.resolution).toBe("invalid");
  });

  test("D. valid email completes the required information", async () => {
    mockedGetProduct.mockResolvedValue(digitalProduct());
    const result = await calculateOrderState(
      makeOrder({ collected_info: { quantity: 1, email: "Customer@Example.com" } as any })
    );
    expect(result.missingFields).toEqual([]);
    expect(result.fieldResolutions.email.normalizedValue).toBe("customer@example.com");
  });

  test("E. complete digital order becomes READY_FOR_PAYMENT", async () => {
    mockedGetProduct.mockResolvedValue(digitalProduct());
    const result = await calculateOrderState(
      makeOrder({ collected_info: { quantity: 1, email: "c@example.com" } as any })
    );
    expect(result.status).toBe("READY_FOR_PAYMENT");
    expect(result.isDigital).toBe(true);
  });

  test("F. total is unit price x quantity in the product currency", async () => {
    mockedGetProduct.mockResolvedValue(digitalProduct());
    for (const [qty, expected] of [[1, 130], [2, 260], [7, 910]] as const) {
      const result = await calculateOrderState(
        makeOrder({ collected_info: { quantity: qty, email: "c@example.com" } as any })
      );
      expect(result.totalAmount).toBe(expected);
      expect(result.orderCurrency).toBe("USD");
    }
  });

  test("F2. a decimal unit price does not accumulate float error", async () => {
    mockedGetProduct.mockResolvedValue(digitalProduct({ instagramSellingPrice: 10.1, currency: "AED" }));
    const result = await calculateOrderState(
      makeOrder({ collected_info: { quantity: 3, email: "c@example.com" } as any })
    );
    expect(result.totalAmount).toBe(30.3);
    expect(result.orderCurrency).toBe("AED");
  });
});

describe("G–H. no physical fields unless explicitly configured", () => {
  test("G. digital order never asks for shippingAddress", async () => {
    mockedGetProduct.mockResolvedValue(digitalProduct());
    const result = await calculateOrderState(makeOrder());
    expect(result.requiredFields).not.toContain("shippingAddress");
  });

  test("H. digital order never asks for phone", async () => {
    mockedGetProduct.mockResolvedValue(digitalProduct());
    const result = await calculateOrderState(makeOrder());
    expect(result.requiredFields).not.toContain("phone");
  });

  test("G2/H2. positive control: they ARE asked when the product configures them", async () => {
    mockedGetProduct.mockResolvedValue(
      digitalProduct({ purchaseRequirements: { requiredFields: ["quantity", "email", "phone"] } })
    );
    const result = await calculateOrderState(makeOrder());
    expect(result.requiredFields).toEqual(["quantity", "email", "phone"]);
    expect(result.requiredFields).not.toContain("shippingAddress");
  });

  test("H3. a digital product with no purchaseRequirements still never asks address/phone", async () => {
    mockedGetProduct.mockResolvedValue(digitalProduct({ purchaseRequirements: undefined }));
    const result = await calculateOrderState(makeOrder());
    expect(result.requiredFields).not.toContain("shippingAddress");
    expect(result.requiredFields).not.toContain("phone");
  });
});

describe("I–J. dormant subsystems stay dormant", () => {
  test("I. a full digital order never invokes physical/Amazon sourcing", async () => {
    mockedGetProduct.mockResolvedValue(digitalProduct());
    const orderId = "6a84562419d6d3f2736ec458";
    mockOrderStore[orderId] = makeOrder();

    await runOrderOrchestrator(orderId); // -> INFORMATION_REQUIRED
    mockOrderStore[orderId].collected_info = { quantity: 2, email: "c@example.com" };
    await runOrderOrchestrator(orderId); // -> READY_FOR_PAYMENT

    expect(mockOrderStore[orderId].status).toBe("READY_FOR_PAYMENT");
    expect(mockOrderStore[orderId].status).not.toBe("READY_FOR_SOURCING_CHECK");
    expect(mockedSourcing).not.toHaveBeenCalled();
  });

  test("J. a full digital order never invokes runtime supplier/eligibility verification", async () => {
    mockedGetProduct.mockResolvedValue(digitalProduct());
    const orderId = "6a84562419d6d3f2736ec459";
    mockOrderStore[orderId] = makeOrder({ collected_info: { quantity: 1, email: "c@example.com" } as any });

    await runOrderOrchestrator(orderId);

    expect(mockedEligibility).not.toHaveBeenCalled();
    const events = mockUpdates.filter((u) => JSON.stringify(u.update).includes("DIGITAL_ELIGIBILITY"));
    expect(events).toHaveLength(0);
  });

  test("J2. the digital total is persisted with the order", async () => {
    mockedGetProduct.mockResolvedValue(digitalProduct());
    const orderId = "6a84562419d6d3f2736ec460";
    mockOrderStore[orderId] = makeOrder({ collected_info: { quantity: 2, email: "c@example.com" } as any });

    await runOrderOrchestrator(orderId);

    expect(mockOrderStore[orderId].totalAmount).toBe(260);
    expect(mockOrderStore[orderId].orderCurrency).toBe("USD");
  });
});

describe("K–L. payment authority belongs to the backend, never the model", () => {
  test("K. an order sitting at READY_FOR_PAYMENT is never advanced by re-running the orchestrator", async () => {
    mockedGetProduct.mockResolvedValue(digitalProduct());
    const orderId = "6a84562419d6d3f2736ec461";
    mockOrderStore[orderId] = makeOrder({
      status: "READY_FOR_PAYMENT" as OrderState,
      collected_info: { quantity: 1, email: "c@example.com" } as any,
    });

    for (let i = 0; i < 3; i++) await runOrderOrchestrator(orderId);

    expect(mockOrderStore[orderId].status).toBe("READY_FOR_PAYMENT");
    expect(mockOrderStore[orderId].status).not.toBe("PAID");
  });

  test('K2. a customer message claiming "I paid" cannot produce PAID', async () => {
    jest.resetModules();
    // resetModules gives the re-imported graph fresh mocks, so re-establish the catalog.
    const product = digitalProduct();
    jest.doMock("@/lib/db/commerce-products", () => ({
      __esModule: true,
      getCommerceProduct: jest.fn(async () => product),
    }));
    jest.doMock("@/lib/ai/sonia", () => ({
      __esModule: true,
      generateSoniaResponse: jest.fn(async () => ({
        // A maximally badly-behaved model: it asserts payment and tries to set state.
        content: "Great news — your payment went through and your order is confirmed!",
        recommendations: [],
        provider: "mock",
        intent: "CHECKOUT_INTENT",
        extractedOrderFields: { paid: true, status: "PAID", paymentConfirmed: true },
      })),
    }));
    jest.doMock("@/lib/db/conversations", () => ({
      __esModule: true,
      getConversation: jest.fn(async () => []),
      saveConversation: jest.fn(async () => undefined),
    }));

    const orderId = "6a84562419d6d3f2736ec462";
    mockOrderStore[orderId] = makeOrder({
      _id: { toString: () => orderId } as any,
      status: "READY_FOR_PAYMENT" as OrderState,
      collected_info: { quantity: 1, email: "c@example.com" } as any,
    });
    jest.doMock("@/lib/db/commerce-orders", () => {
      const actual = jest.requireActual("@/lib/db/commerce-orders");
      return {
        __esModule: true,
        ...actual,
        getActiveOrderForCustomer: jest.fn(async () => mockOrderStore[orderId]),
      };
    });

    const { processMessage } = await import("@/lib/brain");
    await processMessage({ userId: "ig-user-1", channel: "instagram_dm", text: "I paid" });

    expect(mockOrderStore[orderId].status).toBe("READY_FOR_PAYMENT");
    expect(mockOrderStore[orderId].status).not.toBe("PAID");
  });

  test("L. calculateOrderState can never return PAID for any customer-reachable input", async () => {
    mockedGetProduct.mockResolvedValue(digitalProduct());
    const reachable: OrderState[] = [
      "ORDER_REQUESTED",
      "INFORMATION_REQUIRED",
      "READY_FOR_PAYMENT",
      "PAYMENT_PENDING",
      "PRODUCT_LINKAGE_REQUIRED",
      "ORDER_NOT_AVAILABLE",
    ];
    for (const status of reachable) {
      for (const collected of [{}, { quantity: 1 }, { quantity: 1, email: "c@example.com" }]) {
        const result = await calculateOrderState(makeOrder({ status, collected_info: collected as any }));
        expect(result.status).not.toBe("PAID");
      }
    }
  });

  test("L2. no customer-runtime module transitions an order to PAID", () => {
    // Static invariant: only an authoritative payment confirmation may create PAID, and
    // no such component exists yet. This test fails the moment one is wired into the
    // conversational path instead of a verified webhook.
    const customerRuntime = [
      "lib/brain.ts",
      "lib/ai/sonia.ts",
      "lib/commerce/orchestrator.ts",
      "lib/instagram/handlers.ts",
      "lib/instagram/renderer.ts",
    ];
    const offenders: string[] = [];
    for (const rel of customerRuntime) {
      const src = fs.readFileSync(path.resolve(process.cwd(), rel), "utf8");
      if (/updateOrderStatus\s*\([^)]*['"]PAID['"]/.test(src)) offenders.push(rel);
      if (/status\s*[:=]\s*['"]PAID['"]/.test(src)) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });

  // M. PAID -> AWAITING_FULFILLMENT + Telegram notification.
  // Deliberately NOT asserted: neither the payment gateway nor the fulfillment tail
  // exists yet (Phase 3+). Writing a passing test here would be the same false
  // confidence this phase exists to remove.
  test.todo("M. PAID digital order -> AWAITING_FULFILLMENT + Telegram notification (blocked: no payment integration)");
});
