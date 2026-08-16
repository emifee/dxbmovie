import { SupplierProvider, SupplierCheckResult } from "../supplier-provider";
import { SupplierOffer } from "@/lib/db/commerce-products";

/**
 * A mock supplier adapter to prove the end-to-end preflight verification flow
 * before integrating real scraping or API data.
 */
export class MockSupplierProvider implements SupplierProvider {
  name = "MockSupplier";
  isMock = true;

  async checkVariantAvailability(
    offer: SupplierOffer,
    requestedVariant: { size?: string; color?: string; quantity: number; shippingCountry?: string }
  ): Promise<SupplierCheckResult> {
    
    // Simulate latency
    await new Promise(resolve => setTimeout(resolve, 800));

    // Simulate strict matching
    let matchedBy: "supplier_product_id" | "exact_url" | "exact_title" | "title_brand_model" | "manual" = "manual";
    let matchConfidence = 0.5;

    if (offer.supplierProductId) {
      matchedBy = "supplier_product_id";
      matchConfidence = 1.0;
    } else if (offer.supplierProductUrl) {
      matchedBy = "exact_url";
      matchConfidence = 0.98;
    } else if (offer.supplierProductTitle) {
      matchedBy = "exact_title";
      matchConfidence = 0.95;
    }

    // Determine variant availability
    // For testing: If the requested size is exactly "42", we simulate availability.
    // If it's "44", we simulate unavailability.
    const sizeRequested = requestedVariant.size;
    let sizeAvailable = undefined;
    if (sizeRequested) {
      sizeAvailable = sizeRequested === "42" ? true : (sizeRequested === "44" ? false : true);
    }

    const colorRequested = requestedVariant.color;
    let colorAvailable = undefined;
    if (colorRequested) {
      // Simulate that "green/white" is unavailable, but others are ok
      colorAvailable = colorRequested.toLowerCase().includes("green") ? false : true;
    }

    const quantityRequested = requestedVariant.quantity;
    const quantityAvailable = quantityRequested <= 5; // allow up to 5

    // Overall availability calculation
    let availability: "in_stock" | "low_stock" | "out_of_stock" | "unknown" = "in_stock";
    if (sizeAvailable === false || colorAvailable === false || !quantityAvailable) {
      availability = "out_of_stock";
    }

    return {
      offerId: offer._id?.toString() || offer.commerceProductId,
      productMatch: {
        matched: matchConfidence >= 0.9,
        confidence: matchConfidence,
        matchedBy
      },
      variant: {
        sizeRequested,
        sizeAvailable,
        colorRequested,
        colorAvailable,
        quantityRequested,
        quantityAvailable
      },
      pricing: {
        liveUnitPrice: offer.supplierPriceAtListing, // using listing price as mock live price
        currency: offer.currency,
        estimatedLandedCost: offer.supplierPriceAtListing * quantityRequested
      },
      destination: {
        country: requestedVariant.shippingCountry,
        supported: true // Mock assume true
      },
      availability,
      sourceUrl: offer.supplierProductUrl || `https://mock.supplier.com/p/${offer.supplierProductId}`,
      source: "mock",
      checkedAt: new Date()
    };
  }
}
