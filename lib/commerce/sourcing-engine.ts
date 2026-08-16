/**
 * Sourcing Engine
 * 
 * Handles the transition from READY_FOR_SOURCING_CHECK:
 * 1. Logs SUPPLIER_CHECK_STARTED audit event
 * 2. Sends Telegram notification to Admin with full order details
 * 3. Looks up the stored SupplierOffer via the product's stored Amazon URL
 * 4. Runs price verification through a pluggable verifier
 * 5. Evaluates economics against the product's pricing policy
 * 6. Either proceeds to READY_FOR_PAYMENT or triggers PRICE_CHANGE_CUSTOMER_APPROVAL_REQUIRED
 */

import { CommerceOrder, appendSourcingEvent, updateOrderStatus, updateOrderRepricing, OrderState } from "@/lib/db/commerce-orders";
import { getCommerceProduct, getSupplierOffersForProduct, DEFAULT_PRICING_POLICY, PricingPolicy, CommerceProduct, SupplierOffer } from "@/lib/db/commerce-products";
import { sendTelegramNotification } from "@/lib/commerce/telegram";

// --------------- Pluggable Price Verifier ---------------

export interface PriceVerificationResult {
  verified: boolean;
  authoritative: boolean;
  livePrice?: number;
  currency?: string;
  available?: boolean;
  source: "manual_test" | "creators_api" | "scraper" | "stored_price";
  verifiedAt: Date;
  notes?: string;
}

export interface PriceVerifier {
  name: string;
  verify(offer: SupplierOffer): Promise<PriceVerificationResult>;
}

/**
 * Default verifier: uses the stored price as-is.
 * This is the "manual test" mode until Creators API is available.
 */
export class StoredPriceVerifier implements PriceVerifier {
  name = "stored_price";
  
  async verify(offer: SupplierOffer): Promise<PriceVerificationResult> {
    return {
      verified: true,
      authoritative: false,
      livePrice: offer.supplierPriceAtListing,
      currency: offer.currency,
      available: true,
      source: "stored_price",
      verifiedAt: new Date(),
      notes: "Using stored observed price. Live verification not yet available (awaiting Creators API).",
    };
  }
}

// Singleton — swap out later when Creators API is integrated
let activeVerifier: PriceVerifier = new StoredPriceVerifier();

export function setActivePriceVerifier(verifier: PriceVerifier) {
  activeVerifier = verifier;
}

// --------------- Economics Evaluation ---------------

interface EconomicsResult {
  customerPrice: number;
  supplierPrice: number;
  grossMarginPercent: number;
  markupPercent: number;
  economicsHealthy: boolean;
  requiresReprice: boolean;
  proposedNewPrice?: number;
}

function evaluateEconomics(
  customerPrice: number,
  supplierPrice: number,
  policy: PricingPolicy
): EconomicsResult {
  // Gross margin = (revenue - cost) / revenue * 100
  const grossMarginPercent = customerPrice > 0 
    ? ((customerPrice - supplierPrice) / customerPrice) * 100 
    : -100;
  
  // Effective markup = (revenue - cost) / cost * 100
  const markupPercent = supplierPrice > 0 
    ? ((customerPrice - supplierPrice) / supplierPrice) * 100 
    : -100;

  const minMargin = policy.minimumGrossMarginPercent ?? 0;
  const economicsHealthy = grossMarginPercent >= minMargin && customerPrice > supplierPrice;

  let requiresReprice = false;
  let proposedNewPrice: number | undefined;

  if (!economicsHealthy) {
    requiresReprice = true;
    // newCustomerPrice = landedSupplierCost × (1 + markupPercent / 100)
    proposedNewPrice = Math.ceil(supplierPrice * (1 + policy.markupPercent / 100));
  }

  return {
    customerPrice,
    supplierPrice,
    grossMarginPercent: Math.round(grossMarginPercent * 100) / 100,
    markupPercent: Math.round(markupPercent * 100) / 100,
    economicsHealthy,
    requiresReprice,
    proposedNewPrice,
  };
}

// --------------- Telegram Notifications ---------------

async function notifyAdminEconomicsResult(order: CommerceOrder, product: CommerceProduct, economics: EconomicsResult) {
  let msg: string;

  if (economics.economicsHealthy) {
    msg = [
      `SOURCING CHECK PASSED`,
      ``,
      `Order: ${order._id}`,
      `Product: ${product.instagramProductTitle}`,
      ``,
      `Customer Price: ${product.currency} ${economics.customerPrice}`,
      `Supplier Price: ${product.currency} ${economics.supplierPrice}`,
      `Gross Margin: ${economics.grossMarginPercent}%`,
      `Markup: ${economics.markupPercent}%`,
      ``,
      `Economics are healthy. Order is ready for payment.`,
    ].join("\n");
  } else {
    msg = [
      `SOURCING CHECK: PRICE CHANGE REQUIRED`,
      ``,
      `Order: ${order._id}`,
      `Product: ${product.instagramProductTitle}`,
      ``,
      `Customer Price: ${product.currency} ${economics.customerPrice}`,
      `Supplier Price: ${product.currency} ${economics.supplierPrice}`,
      `Gross Margin: ${economics.grossMarginPercent}% (BELOW MINIMUM)`,
      ``,
      `Proposed New Price: ${product.currency} ${economics.proposedNewPrice}`,
      ``,
      `Waiting for customer approval on new price.`,
    ].join("\n");
  }

  await sendTelegramNotification(msg, false);
}

// --------------- Main Sourcing Engine ---------------

export async function executeSourcingCheck(order: CommerceOrder): Promise<void> {
  const orderId = order._id!.toString();
  
  // 1. Atomic claim to prevent race conditions
  const { claimOrderForSourcing } = await import("@/lib/db/commerce-orders");
  const claimedOrder = await claimOrderForSourcing(orderId);
  
  if (!claimedOrder) {
    console.log(`[SourcingEngine] Order ${orderId} is already claimed by another sourcing process or no longer READY_FOR_SOURCING_CHECK. Skipping.`);
    return;
  }

  try {
    // 2. Log sourcing start with the attempt ID
    await appendSourcingEvent(orderId, "SUPPLIER_CHECK_STARTED", {
      triggeredAt: new Date().toISOString(),
      attemptId: claimedOrder.sourcingAttemptId,
    });

    // 2. Find the linked product
    let product: CommerceProduct | null = null;
    
    if (order.commerceProductId) {
      product = await getCommerceProduct(order.commerceProductId);
    }
    
    if (!product) {
      // Try fuzzy match by title
      const { searchCommerceProducts } = await import("@/lib/db/commerce-products");
      const matches = await searchCommerceProducts(order.displayed_product_title);
      product = matches.length > 0 ? matches[0] : null;
    }

    if (!product) {
      await appendSourcingEvent(orderId, "PRODUCT_NOT_FOUND", {
        displayedTitle: order.displayed_product_title,
      });
      await updateOrderStatus(orderId, "PRICE_REVIEW_REQUIRED");
      await sendTelegramNotification(
        `SOURCING FAILED: Could not match product "${order.displayed_product_title}" to catalog. Order ${orderId} needs manual review.`,
        false
      );
      return;
    }

    // 3. Get the preferred supplier offer
    const offers = await getSupplierOffersForProduct(product.id);
    const offer = offers.find(o => o._id?.toString() === product!.preferredSupplierOfferId) || offers[0];

    if (!offer) {
      await appendSourcingEvent(orderId, "NO_SUPPLIER_OFFER", {
        productId: product.id,
      });
      await updateOrderStatus(orderId, "PRICE_REVIEW_REQUIRED");
      await sendTelegramNotification(
        `SOURCING FAILED: No supplier offer found for product "${product.instagramProductTitle}". Order ${orderId} needs manual review.`,
        false
      );
      return;
    }

    // 4. Send Phase 2 Telegram update
    await sendTelegramNotification(`🔎 Supplier verification starting...`, false);
    await appendSourcingEvent(orderId, "ADMIN_NOTIFIED", {
      productId: product.id,
      offerId: offer._id?.toString(),
    });

    // 5. Run price verification through the pluggable verifier
    const verification = await activeVerifier.verify(offer);
    
    await appendSourcingEvent(orderId, "PRICE_VERIFIED", {
      source: verification.source,
      livePrice: verification.livePrice,
      storedPrice: offer.supplierPriceAtListing,
      available: verification.available,
      notes: verification.notes,
    });

    if (!verification.verified || !verification.available) {
      await updateOrderStatus(orderId, "PRICE_REVIEW_REQUIRED");
      await sendTelegramNotification(
        `SOURCING FAILED: Supplier verification failed for "${product.instagramProductTitle}". Source: ${verification.source}. Notes: ${verification.notes || "N/A"}`,
        false
      );
      return;
    }

    // 6. Evaluate economics
    const policy = product.pricingPolicy || DEFAULT_PRICING_POLICY;
    const supplierPrice = verification.livePrice ?? offer.supplierPriceAtListing;
    const customerPrice = product.instagramSellingPrice;
    
    const economics = evaluateEconomics(customerPrice, supplierPrice, policy);

    await appendSourcingEvent(orderId, economics.economicsHealthy ? "ECONOMICS_HEALTHY" : "ECONOMICS_UNHEALTHY", {
      customerPrice,
      supplierPrice,
      grossMarginPercent: economics.grossMarginPercent,
      markupPercent: economics.markupPercent,
      proposedNewPrice: economics.proposedNewPrice,
    });

    // 7. Notify admin of economics result
    await notifyAdminEconomicsResult(order, product, economics);

    // 8. Transition order based on economics
    if (economics.economicsHealthy) {
      // Economics are fine — supplier price may have changed but customer price still works
      if (supplierPrice !== offer.supplierPriceAtListing) {
        await appendSourcingEvent(orderId, "SUPPLIER_PRICE_CHANGED_MARGIN_OK", {
          oldSupplierPrice: offer.supplierPriceAtListing,
          newSupplierPrice: supplierPrice,
        });
      }
      
      if (verification.authoritative) {
        await updateOrderStatus(orderId, "READY_FOR_PAYMENT");
      } else {
        await updateOrderStatus(orderId, "PREFLIGHT_TEST_PASSED");
        await sendTelegramNotification(
          `Historical Amazon price was ${offer.currency} ${offer.supplierPriceAtListing}. Live verification is required before payment.`,
          false
        );
      }
    } else {
      // Economics broken — need customer approval for new price
      if (policy.allowAutomaticReprice) {
        const repricingVersion = (order.repricingVersion || 0) + 1;
        await updateOrderRepricing(orderId, economics.proposedNewPrice!, customerPrice, product.currency, repricingVersion);
        await appendSourcingEvent(orderId, "REPRICE_REQUESTED", {
          originalPrice: customerPrice,
          proposedPrice: economics.proposedNewPrice,
          proposedCurrency: product.currency,
          repricingVersion,
        });
      } else {
        // Manual review required — don't auto-reprice
        await updateOrderStatus(orderId, "PRICE_REVIEW_REQUIRED");
        await appendSourcingEvent(orderId, "MANUAL_PRICE_REVIEW_REQUIRED", {
          reason: "allowAutomaticReprice is false",
        });
      }
    }
    
  } catch (error: any) {
    console.error(`[SourcingEngine] Exception during sourcing check for order ${orderId}:`, error);
    await appendSourcingEvent(orderId, "SOURCING_ERROR", {
      error: error.message,
    });
    await updateOrderStatus(orderId, "PRICE_REVIEW_REQUIRED");
    await sendTelegramNotification(
      `SOURCING ERROR: Order ${orderId} encountered an error during sourcing. Error: ${error.message}`,
      false
    );
  }
}
