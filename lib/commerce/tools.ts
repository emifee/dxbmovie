import { searchCommerceProducts, getCommerceProduct, getSupplierOffersForProduct } from "@/lib/db/commerce-products";

export async function executeCommerceTool(toolName: string, args: any): Promise<any> {
  switch (toolName) {
    case "search_catalog": {
      const { query, maxPrice, category } = args;
      const products = await searchCommerceProducts(query, maxPrice, category);
      
      return products.map(p => ({
        id: p.id || p.instagramProductId,
        title: p.instagramProductTitle || p.title,
        description: p.description,
        category: p.category,
        movieRelationship: p.movieRelationship,
      }));
    }

    case "get_supplier_offers": {
      const { commerceProductId } = args;
      const product = await getCommerceProduct(commerceProductId);
      if (!product) {
        return { error: "Product not found" };
      }

      const offers = await getSupplierOffersForProduct(commerceProductId);
      
      return {
        product: {
          id: product.id || product.instagramProductId,
          title: product.instagramProductTitle || product.title,
          description: product.description,
        },
        offers: offers.map(o => ({
          supplier: o.supplier,
          marketplace: o.marketplace,
          partnerTag: o.partnerTag,
          supplierProductId: o.supplierProductId,
          price: o.supplierPriceAtListing,
          currency: o.currency,
          availability: o.status,
        }))
      };
    }

    default:
      throw new Error(`Unknown commerce tool: ${toolName}`);
  }
}

export const commerceTools = {
  search_catalog: {
    description: "Search the internal DXBmovies product catalog for merchandise related to a movie, character, or general query. Use this to find products.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query (e.g., 'sunglasses', 'Iron Man helmet')" },
        category: { type: "string", description: "Optional category filter" },
        maxPrice: { type: "number", description: "Optional maximum price filter" },
      },
      required: ["query"],
    },
  },
  get_supplier_offers: {
    description: "Get the current pricing, supplier, and availability for a specific commerce product. ALWAYS use this tool before mentioning price or availability.",
    parameters: {
      type: "object",
      properties: {
        commerceProductId: { type: "string", description: "The ID of the commerce product." },
      },
      required: ["commerceProductId"],
    },
  }
};
