/**
 * What Sonia is allowed to offer.
 *
 * The catalog is the source of truth for what DXBmovies sells. A customer-facing lookup
 * must only ever surface products an admin has explicitly switched on — otherwise Sonia
 * can offer something we cannot actually sell (e.g. Microsoft 365, which is configured
 * with orderingEnabled: false pending resale authorisation).
 */

let capturedFilter: any = null;
let mockRows: any[] = [];

jest.mock("@/lib/mongodb", () => ({
  __esModule: true,
  default: Promise.resolve({
    db: () => ({
      collection: () => ({
        find: (filter: any) => {
          capturedFilter = filter;
          return { limit: () => ({ toArray: async () => mockRows }) };
        },
      }),
    }),
  }),
}));

import { searchCommerceProducts } from "@/lib/db/commerce-products";
import { executeCommerceTool } from "@/lib/commerce/tools";

beforeEach(() => {
  capturedFilter = null;
  mockRows = [];
});

describe("catalog visibility", () => {
  test("admin search is unrestricted (sees drafts, disabled products, everything active)", async () => {
    await searchCommerceProducts("micro");
    expect(capturedFilter.orderingEnabled).toBeUndefined();
    expect(capturedFilter.customerVisible).toBeUndefined();
  });

  test("customer-facing search only returns products enabled for ordering", async () => {
    await searchCommerceProducts("micro", undefined, undefined, { customerFacing: true });
    expect(capturedFilter.orderingEnabled).toBe(true);
    expect(capturedFilter.customerVisible).toEqual({ $ne: false });
    expect(capturedFilter.status).toBe("active");
  });

  test("Sonia's catalog tool always uses the customer-facing filter", async () => {
    mockRows = [{
      id: "p1", instagramProductTitle: "Enabled Digital Thing", description: "d",
      category: "software", fulfillmentType: "digital", instagramSellingPrice: 25, currency: "USD",
    }];

    const result: any = await executeCommerceTool("search_catalog", { query: "thing" });

    expect(capturedFilter.orderingEnabled).toBe(true);
    expect(result.products).toHaveLength(1);
    expect(result.products[0].price).toBe(25);
    expect(result.products[0].currency).toBe("USD");
    expect(result.note).toMatch(/only products currently available/i);
  });

  test("an empty catalog result tells Sonia to say we don't offer it", async () => {
    mockRows = [];
    const result: any = await executeCommerceTool("search_catalog", { query: "something we do not sell" });

    expect(result.products).toEqual([]);
    expect(result.note).toMatch(/do not currently offer this/i);
    expect(result.note).toMatch(/do not promise to add it/i);
  });
});
