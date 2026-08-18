/**
 * Phase 1 — Product identity invariant.
 *
 * An order whose CommerceProduct cannot be resolved is UNKNOWN. It must never inherit
 * physical defaults, digital defaults, category requirements, or a sourcing path.
 *
 * These tests exercise the real orchestrator against an in-memory catalog and an
 * in-memory Mongo double. They never touch the production database.
 */

const mockOrderStore: Record<string, any> = {};
const mockUpdates: Array<{ filter: any; update: any }> = [];

jest.mock("@/lib/mongodb", () => ({
  __esModule: true,
  default: Promise.resolve({
    db: () => ({
      collection: () => ({
        findOne: async (q: any) => {
          if (q._id !== undefined) return mockOrderStore[String(q._id)] ?? null;
          // customer-scoped active-order lookup
          const wanted: string[] = q.status?.$in ?? [];
          const matches = Object.values(mockOrderStore).filter(
            (o: any) => o.customer_igsid === q.customer_igsid && wanted.includes(o.status)
          );
          matches.sort((a: any, b: any) => b.created_at - a.created_at);
          return matches[0] ?? null;
        },
        updateOne: async (filter: any, update: any) => {
          mockUpdates.push({ filter, update });
          const existing = mockOrderStore[String(filter._id)];
          if (existing && update.$set) Object.assign(existing, update.$set);
          return { modifiedCount: 1 };
        },
        updateMany: async (filter: any, update: any) => {
          mockUpdates.push({ filter, update });
          let modifiedCount = 0;
          for (const doc of Object.values(mockOrderStore) as any[]) {
            if (doc.customer_igsid !== filter.customer_igsid) continue;
            if (filter.status && doc.status !== filter.status) continue;
            modifiedCount++;
            if (update.$push) {
              for (const [k, v] of Object.entries(update.$push)) {
                doc[k] = [...(doc[k] ?? []), v];
              }
            }
            if (update.$set) Object.assign(doc, update.$set);
          }
          return { modifiedCount };
        },
        insertOne: async (doc: any) => {
          const id = "inserted-" + (Object.keys(mockOrderStore).length + 1);
          mockOrderStore[id] = { ...doc, _id: id };
          return { insertedId: id };
        },
      }),
    }),
  }),
}));

jest.mock("@/lib/db/commerce-products", () => ({
  __esModule: true,
  getCommerceProduct: jest.fn(),
}));

// Address validation calls Google Geocoding. These tests are about linkage recovery,
// not geocoding, so resolve addresses deterministically without any network access.
jest.mock("@/lib/commerce/location", () => {
  const actual = jest.requireActual("@/lib/commerce/location");
  return {
    __esModule: true,
    ...actual,
    resolveLocation: jest.fn(async (raw: any) => ({
      rawAddress: typeof raw === "string" ? raw : JSON.stringify(raw),
      normalizedAddress: "Dubai Marina, Dubai, United Arab Emirates",
      countryCode: "AE",
      countryName: "United Arab Emirates",
      callingCode: "+971",
      confidence: "high",
      validationStatus: "verified",
      validationProvider: "google_geocoding",
    })),
  };
});

jest.mock("@/lib/commerce/sourcing-engine", () => ({
  __esModule: true,
  executeSourcingCheck: jest.fn(async () => undefined),
}));

import { calculateOrderState } from "@/lib/commerce/orchestrator";
import { runOrderOrchestrator, CommerceOrder, OrderState } from "@/lib/db/commerce-orders";
import { getCommerceProduct } from "@/lib/db/commerce-products";
import { executeSourcingCheck } from "@/lib/commerce/sourcing-engine";

const mockedGetProduct = getCommerceProduct as jest.MockedFunction<typeof getCommerceProduct>;
const mockedSourcing = executeSourcingCheck as jest.MockedFunction<any>;

const DIGITAL_PRODUCT: any = {
  id: "p-digital",
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

const PHYSICAL_PRODUCT: any = {
  id: "p-physical",
  instagramProductTitle: 'Samsung 34" Odyssey G5',
  fulfillmentType: "physical",
  orderingEnabled: true,
  customerVisible: true,
  status: "active",
  instagramSellingPrice: 2500,
  currency: "AED",
  category: "electronics",
  description: "",
  images: [],
};

function makeOrder(overrides: Partial<CommerceOrder> = {}): CommerceOrder {
  return {
    customer_igsid: "ig-user-1",
    native_message_id: "mid-1",
    displayed_product_title: "PlayStation 5 Pro",
    status: "ORDER_REQUESTED" as OrderState,
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

describe("product identity invariant — fail closed", () => {
  test("1. commerceProductId missing entirely -> PRODUCT_LINKAGE_REQUIRED", async () => {
    const result = await calculateOrderState(makeOrder());
    expect(result.status).toBe("PRODUCT_LINKAGE_REQUIRED");
    expect(result.productIdentityResolved).toBe(false);
    expect(mockedGetProduct).not.toHaveBeenCalled();
  });

  test("2. commerceProductId present but product does not resolve -> PRODUCT_LINKAGE_REQUIRED", async () => {
    mockedGetProduct.mockResolvedValue(null);
    const result = await calculateOrderState(makeOrder({ commerceProductId: "6a84562419d6d3f2736ec457" }));
    expect(result.status).toBe("PRODUCT_LINKAGE_REQUIRED");
    expect(result.productIdentityResolved).toBe(false);
    expect(mockedGetProduct).toHaveBeenCalledWith("6a84562419d6d3f2736ec457");
  });

  test("3. unresolved identity assigns NO requirements (no generic physical fallback)", async () => {
    mockedGetProduct.mockResolvedValue(null);
    for (const order of [makeOrder(), makeOrder({ commerceProductId: "nope" })]) {
      const result = await calculateOrderState(order);
      expect(result.requiredFields).toEqual([]);
      expect(result.missingFields).toEqual([]);
      expect(result.fieldResolutions).toEqual({});
    }
  });

  test("4. unresolved identity never requests shippingAddress", async () => {
    mockedGetProduct.mockResolvedValue(null);
    const result = await calculateOrderState(makeOrder({ commerceProductId: "nope" }));
    expect(result.requiredFields).not.toContain("shippingAddress");
    expect(result.missingFields).not.toContain("shippingAddress");
  });

  test("5. unresolved identity never requests phone", async () => {
    mockedGetProduct.mockResolvedValue(null);
    const result = await calculateOrderState(makeOrder({ commerceProductId: "nope" }));
    expect(result.requiredFields).not.toContain("phone");
    expect(result.missingFields).not.toContain("phone");
  });

  test("6. unresolved identity never requests email", async () => {
    mockedGetProduct.mockResolvedValue(null);
    const result = await calculateOrderState(makeOrder({ commerceProductId: "nope" }));
    expect(result.requiredFields).not.toContain("email");
    expect(result.missingFields).not.toContain("email");
  });

  test("7. unresolved identity never reaches READY_FOR_SOURCING_CHECK", async () => {
    mockedGetProduct.mockResolvedValue(null);
    // Even a title that looks physical, and an order already carrying collected fields.
    const result = await calculateOrderState(
      makeOrder({
        displayed_product_title: "Samsung 34 inch Odyssey monitor",
        status: "INFORMATION_REQUIRED" as OrderState,
        collected_info: { quantity: 1, phone: "+2348169875198" } as any,
      })
    );
    expect(result.status).toBe("PRODUCT_LINKAGE_REQUIRED");
    expect(result.status).not.toBe("READY_FOR_SOURCING_CHECK");
  });

  test("8. unresolved identity creates no sourcing events and never invokes sourcing", async () => {
    mockedGetProduct.mockResolvedValue(null);
    const orderId = "6a84562419d6d3f2736ec458";
    mockOrderStore[orderId] = makeOrder({
      commerceProductId: "unresolvable-id",
      displayed_product_title: "PlayStation 5 Pro",
    });

    await runOrderOrchestrator(orderId);

    expect(mockedSourcing).not.toHaveBeenCalled();
    expect(mockOrderStore[orderId].status).toBe("PRODUCT_LINKAGE_REQUIRED");
    const pushed = mockUpdates.filter((u) => u.update.$push);
    expect(pushed).toHaveLength(0);
    const sourcingWrites = mockUpdates.filter((u) => JSON.stringify(u.update).includes("sourcingEvents"));
    expect(sourcingWrites).toHaveLength(0);
  });

  test("native Instagram order creation path (ORDER_REQUESTED, unmatched) fails closed", async () => {
    // Mirrors app/api/webhooks/instagram/route.ts: createCommerceOrder(status ORDER_REQUESTED,
    // commerceProductId undefined) followed immediately by runOrderOrchestrator().
    const orderId = "6a8461d98a2f7d57b8dddcac";
    mockOrderStore[orderId] = makeOrder({
      status: "ORDER_REQUESTED" as OrderState,
      commerceProductId: undefined,
      displayed_product_title: "Lightroom Preset Pack",
    });

    await runOrderOrchestrator(orderId);

    expect(mockOrderStore[orderId].status).toBe("PRODUCT_LINKAGE_REQUIRED");
    expect(mockOrderStore[orderId].requiredFields).toEqual([]);
    expect(mockedSourcing).not.toHaveBeenCalled();
  });

  test("orders past payment commitment are left untouched, not dragged back to linkage", async () => {
    mockedGetProduct.mockResolvedValue(null);
    const result = await calculateOrderState(
      makeOrder({
        status: "PAID" as OrderState,
        commerceProductId: "deleted-product",
        requiredFields: ["quantity", "email"],
        missingFields: [],
      })
    );
    expect(result.status).toBe("PAID");
    expect(result.requiredFields).toEqual(["quantity", "email"]);
    expect(result.productIdentityResolved).toBe(false);
  });
});

describe("unresolved orders are not silently orphaned (concurrency)", () => {
  test("an unidentified order stops being 'active' after 24h of inactivity", async () => {
    const { getActiveOrderForCustomer } = await import("@/lib/db/commerce-orders");
    const stale = new Date(Date.now() - 25 * 60 * 60 * 1000);
    mockOrderStore["stale"] = makeOrder({
      _id: "stale" as any,
      status: "PRODUCT_LINKAGE_REQUIRED" as OrderState,
      created_at: stale,
      updated_at: stale,
    });

    expect(await getActiveOrderForCustomer("ig-user-1")).toBeNull();
  });

  test("a fresh unidentified order IS still active (control)", async () => {
    const { getActiveOrderForCustomer } = await import("@/lib/db/commerce-orders");
    mockOrderStore["fresh"] = makeOrder({
      _id: "fresh" as any,
      status: "PRODUCT_LINKAGE_REQUIRED" as OrderState,
    });

    const active = await getActiveOrderForCustomer("ig-user-1");
    expect(active?.status).toBe("PRODUCT_LINKAGE_REQUIRED");
  });

  test("a new order records supersession on the prior unidentified order", async () => {
    const { createCommerceOrder } = await import("@/lib/db/commerce-orders");
    mockOrderStore["old"] = makeOrder({
      _id: "old" as any,
      status: "PRODUCT_LINKAGE_REQUIRED" as OrderState,
      collected_info: { quantity: 2 } as any,
    });

    await createCommerceOrder(makeOrder({ displayed_product_title: "A different product" }) as any);

    const events = (mockOrderStore["old"].sourcingEvents ?? []).map((e: any) => e.event);
    expect(events).toContain("SUPERSEDED_BY_NEW_ORDER");
    // Non-destructive: the old order keeps its state and anything already collected.
    expect(mockOrderStore["old"].status).toBe("PRODUCT_LINKAGE_REQUIRED");
    expect(mockOrderStore["old"].collected_info).toEqual({ quantity: 2 });
  });
});

describe("an unavailable order does not block a different new order", () => {
  test("a newer order takes over as the active order", async () => {
    const { getActiveOrderForCustomer } = await import("@/lib/db/commerce-orders");
    mockOrderStore["unavailable"] = makeOrder({
      _id: "unavailable" as any,
      status: "ORDER_NOT_AVAILABLE" as OrderState,
      displayed_product_title: "Microsoft 365 (ordering disabled)",
      created_at: new Date(Date.now() - 60_000),
      updated_at: new Date(Date.now() - 60_000),
    });
    mockOrderStore["fresh"] = makeOrder({
      _id: "fresh" as any,
      status: "ORDER_REQUESTED" as OrderState,
      displayed_product_title: "A completely different product",
    });

    const active = await getActiveOrderForCustomer("ig-user-1");
    expect(active?.displayed_product_title).toBe("A completely different product");
    expect(active?.status).toBe("ORDER_REQUESTED");
  });

  test("an unavailable order also stops being active after 24h", async () => {
    const { getActiveOrderForCustomer } = await import("@/lib/db/commerce-orders");
    const stale = new Date(Date.now() - 25 * 60 * 60 * 1000);
    mockOrderStore["old-unavailable"] = makeOrder({
      _id: "old-unavailable" as any,
      status: "ORDER_NOT_AVAILABLE" as OrderState,
      created_at: stale,
      updated_at: stale,
    });
    expect(await getActiveOrderForCustomer("ig-user-1")).toBeNull();
  });
});

describe("supplier-offer policy is driven by fulfillmentType", () => {
  test("digital linkage does not require a supplier offer", async () => {
    const { supplierOfferRequiredFor } = await import("@/lib/commerce/admin-tools");
    expect(supplierOfferRequiredFor({ fulfillmentType: "digital" })).toBe(false);
  });

  test("physical and service linkage still require one, and an unset type defaults to physical", async () => {
    const { supplierOfferRequiredFor } = await import("@/lib/commerce/admin-tools");
    expect(supplierOfferRequiredFor({ fulfillmentType: "physical" })).toBe(true);
    expect(supplierOfferRequiredFor({ fulfillmentType: "service" })).toBe(true);
    expect(supplierOfferRequiredFor({ fulfillmentType: undefined })).toBe(true);
  });
});

describe("admin linkage recovery — one path, product decides the lifecycle", () => {
  test("9. after linkage to a DIGITAL product, requirements come from purchaseRequirements", async () => {
    mockedGetProduct.mockResolvedValue(DIGITAL_PRODUCT);
    const result = await calculateOrderState(
      makeOrder({
        status: "PRODUCT_LINKAGE_REQUIRED" as OrderState,
        commerceProductId: "p-digital",
      })
    );
    expect(result.productIdentityResolved).toBe(true);
    expect(result.isDigital).toBe(true);
    expect(result.requiredFields).toEqual(["quantity", "email"]);
    expect(result.requiredFields).not.toContain("shippingAddress");
    expect(result.requiredFields).not.toContain("phone");
  });

  test("9b. linked digital order completes to READY_FOR_PAYMENT with unit price x quantity", async () => {
    mockedGetProduct.mockResolvedValue(DIGITAL_PRODUCT);
    const result = await calculateOrderState(
      makeOrder({
        status: "INFORMATION_REQUIRED" as OrderState,
        commerceProductId: "p-digital",
        collected_info: { quantity: 3, email: "customer@example.com" } as any,
      })
    );
    expect(result.missingFields).toEqual([]);
    expect(result.status).toBe("READY_FOR_PAYMENT");
    expect(result.totalAmount).toBe(390);
    expect(result.orderCurrency).toBe("USD");
  });

  test("10. after linkage to a PHYSICAL product, physical requirements and sourcing path resume", async () => {
    mockedGetProduct.mockResolvedValue(PHYSICAL_PRODUCT);
    const result = await calculateOrderState(
      makeOrder({
        status: "PRODUCT_LINKAGE_REQUIRED" as OrderState,
        commerceProductId: "p-physical",
      })
    );
    expect(result.productIdentityResolved).toBe(true);
    expect(result.isDigital).toBe(false);
    expect(result.requiredFields).toEqual(["quantity", "shippingAddress", "phone"]);
  });

  test("9c/10c. resume is fulfillment-agnostic: same entry state, product picks the lifecycle", async () => {
    // Mirrors admin-tools link_order_product: set INFORMATION_REQUIRED, then run the
    // orchestrator. The product — not the recovery code — decides where the order lands.
    const complete = { quantity: 1, email: "c@example.com" } as any;

    mockedGetProduct.mockResolvedValue(DIGITAL_PRODUCT);
    const digital = await calculateOrderState(
      makeOrder({ status: "INFORMATION_REQUIRED" as OrderState, commerceProductId: "p-digital", collected_info: complete })
    );
    expect(digital.status).toBe("READY_FOR_PAYMENT");

    mockedGetProduct.mockResolvedValue(PHYSICAL_PRODUCT);
    const physical = await calculateOrderState(
      makeOrder({
        status: "INFORMATION_REQUIRED" as OrderState,
        commerceProductId: "p-physical",
        collected_info: {
          quantity: 1,
          shippingAddress: { line1: "Dubai Marina", city: "Dubai", country: "UAE" },
          phone: "+971551994544",
        } as any,
        fieldResolutions: {
          phone: { field: "phone", resolution: "needs_clarification", normalizedValue: "+971551994544" },
        } as any,
      })
    );
    expect(physical.status).toBe("READY_FOR_SOURCING_CHECK");
  });

  test("10b. linked physical order with all fields reaches READY_FOR_SOURCING_CHECK", async () => {
    mockedGetProduct.mockResolvedValue(PHYSICAL_PRODUCT);
    const result = await calculateOrderState(
      makeOrder({
        status: "INFORMATION_REQUIRED" as OrderState,
        commerceProductId: "p-physical",
        collected_info: {
          quantity: 1,
          shippingAddress: { line1: "Dubai Marina", city: "Dubai", country: "UAE" },
          phone: "+971551994544",
        } as any,
        fieldResolutions: {
          phone: { field: "phone", resolution: "needs_clarification", normalizedValue: "+971551994544" },
        } as any,
      })
    );
    expect(result.status).toBe("READY_FOR_SOURCING_CHECK");
    expect(result.isDigital).toBe(false);
  });
});
