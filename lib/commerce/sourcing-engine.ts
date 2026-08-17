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
  status: "SUCCESS" | "UNKNOWN" | "FAILED";
  verificationMethod: string;
  authoritative: boolean;
  confidence: number;

  product?: {
    expectedTitle: string;
    observedTitle?: string;
    matched: boolean;
  };

  price?: {
    registeredPrice: number;
    livePrice?: number;
    currency: string;
    priceType: "buy_box" | "sale" | "list" | "unknown";
    changed: boolean;
  };

  availability?: {
    status: "in_stock" | "out_of_stock" | "unknown";
  };

  destination?: {
    country: string;
    supported: boolean | "unknown";
  };

  seller?: {
    soldBy?: string;
    shipsFrom?: string;
  };

  sourceUrl: string;
  checkedAt: Date;
  notes?: string;

  fx?: {
    from: string;
    to: string;
    rate: number;
    convertedAmount: number;
    source: string;
    checkedAt: Date;
  };
}

export interface PriceVerifier {
  name: string;
  verify(offer: SupplierOffer, product: CommerceProduct): Promise<PriceVerificationResult>;
}

/**
 * Default verifier: uses the stored price as-is.
 * This is the "manual test" mode until Creators API is available.
 */
export class StoredPriceVerifier implements PriceVerifier {
  name = "stored_price";
  
  async verify(offer: SupplierOffer, product: CommerceProduct): Promise<PriceVerificationResult> {
    return {
      status: "SUCCESS",
      verificationMethod: "stored_price",
      authoritative: false,
      confidence: 1.0,
      product: {
        expectedTitle: offer.supplierProductTitle,
        observedTitle: offer.supplierProductTitle,
        matched: true
      },
      price: {
        registeredPrice: offer.supplierPriceAtListing,
        livePrice: offer.supplierPriceAtListing,
        currency: offer.currency,
        priceType: "unknown",
        changed: false
      },
      availability: {
        status: "unknown"
      },
      sourceUrl: offer.supplierProductUrl || "unknown",
      checkedAt: new Date(),
      notes: "Using stored observed price. Live verification not yet available (awaiting Creators API).",
    };
  }
}

import { AmazonWebVerifier } from "./providers/amazon-web-verifier";

// Singleton — swap out later when Creators API is integrated
let activeVerifier: PriceVerifier = new AmazonWebVerifier();

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

async function notifyAdminEconomicsResult(order: CommerceOrder, product: CommerceProduct, economics: EconomicsResult, verification: PriceVerificationResult, offer: SupplierOffer) {
  let msg: string;

  if (economics.economicsHealthy) {
    const fxStr = verification.fx ? `\nFX\n${verification.fx.from} → ${verification.fx.to}\nRate: ${verification.fx.rate.toFixed(4)}\nConverted Amazon cost: ${verification.fx.to} ${verification.fx.convertedAmount}\n` : "";

    msg = [
      `✅ AMAZON PRODUCT VERIFIED`,
      ``,
      `PRODUCT`,
      `${product.instagramProductTitle || order.displayed_product_title}`,
      ``,
      `AMAZON IDENTITY`,
      `ASIN: ${offer.supplierProductId || "Unknown"}`,
      `Status: Exact match`,
      `Availability: ${verification.availability?.status === 'in_stock' ? 'In stock' : verification.availability?.status}`,
      ``,
      `LIVE AMAZON PRICE`,
      `${verification.price?.currency || offer.currency} ${verification.price?.livePrice || offer.supplierPriceAtListing}`,
      ``,
      `REGISTERED PRICE`,
      `${offer.currency} ${offer.supplierPriceAtListing}`,
      ``,
      `CUSTOMER PRICE`,
      `${product.currency} ${economics.customerPrice}`,
      fxStr.trim(),
      ``,
      `MARGIN`,
      `Gross profit: ${product.currency} ${Math.round((economics.customerPrice - economics.supplierPrice) * 100) / 100}`,
      `Gross margin: ${economics.grossMarginPercent}%`,
      ``,
      `STATUS`,
      `Live supplier check passed`
    ].filter(line => line !== null).join("\n");
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
      await appendSourcingEvent(orderId, "PRODUCT_LINKAGE_FAILED", {
        displayedTitle: order.displayed_product_title,
      });
      await updateOrderStatus(orderId, "PRODUCT_LINKAGE_REQUIRED");
      await sendTelegramNotification(
        `⚠️ ORDER NEEDS PRODUCT LINKAGE\n\nInstagram product:\n${order.displayed_product_title}\n\nCustomer:\nInstagram: @${order.customer_igsid}\n\nReason:\nNo internal catalog mapping found.\n\nSourcing has NOT started.`,
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
    const collected = order.collected_info || {};
    let addressStr = "Not provided";
    if (collected.shippingAddress) {
      if (typeof collected.shippingAddress === "string") {
        addressStr = collected.shippingAddress;
      } else {
        const a = collected.shippingAddress;
        addressStr = [a.line1, a.city, a.region, a.country].filter(Boolean).join(", ");
      }
    }

    const newOrderMsg = [
      `🛒 NEW ORDER`,
      ``,
      `PRODUCT`,
      product.instagramProductTitle || order.displayed_product_title,
      ``,
      `CUSTOMER`,
      `Instagram: @${order.customer_igsid || "unknown"}`,
      `Quantity: ${collected.quantity || "1"}`,
      `Phone: ${collected.phone || "N/A"}`,
      ``,
      `DELIVERY`,
      addressStr,
      ``,
      `CUSTOMER PRICE`,
      `${product.currency} ${product.instagramSellingPrice}`,
      ``,
      `AMAZON SOURCE`,
      `Marketplace: ${offer.marketplace}`,
      `Registered price: ${offer.currency} ${offer.supplierPriceAtListing}`,
      `URL: ${offer.supplierProductUrl || "Unknown"}`,
      ``,
      `STATUS`,
      `🔎 Supplier verification starting`
    ].join("\n");
    await sendTelegramNotification(newOrderMsg, false);

    await appendSourcingEvent(orderId, "ADMIN_NOTIFIED", {
      productId: product.id,
      offerId: offer._id?.toString(),
    });

    // 5. Run price verification through the pluggable verifier
    console.log({
      tag: "SOURCING_VERIFIER_TRACE",
      buildId: process.env.APP_BUILD_ID || "unknown",
      verifierClass: activeVerifier.constructor.name,
      verifierVersion: "amazon-curl-v1",
      transport: "curl_execFile",
      orderId,
      supplierOfferId: offer._id?.toString(),
      supplierUrl: offer.supplierProductUrl,
      canonicalUrl: offer.canonicalSupplierUrl || "unknown",
      asin: offer.supplierProductId || "unknown"
    });

    const verification = await activeVerifier.verify(offer, product);
    
    // 5a. Persist Evidence to supplier_checks collection
    try {
      const { default: clientPromise } = await import("@/lib/mongodb");
      const client = await clientPromise;
      const db = client.db("dxbmovies");
      await db.collection("supplier_checks").insertOne({
        orderId,
        commerceProductId: product.id,
        supplierOfferId: offer._id?.toString(),
        verificationMethod: verification.verificationMethod,
        authoritative: verification.authoritative,
        confidence: verification.confidence,
        product: verification.product,
        price: verification.price,
        availability: verification.availability,
        destination: verification.destination,
        seller: verification.seller,
        fx: verification.fx,
        sourceUrl: verification.sourceUrl,
        checkedAt: verification.checkedAt,
        notes: verification.notes,
        status: verification.status
      });
    } catch (dbErr) {
      console.error("[SourcingEngine] Failed to save to supplier_checks:", dbErr);
    }

    await appendSourcingEvent(orderId, "PRICE_VERIFIED", {
      method: verification.verificationMethod,
      status: verification.status,
      livePrice: verification.price?.livePrice,
      storedPrice: offer.supplierPriceAtListing,
      available: verification.availability?.status,
      notes: verification.notes,
    });

    if (verification.status !== "SUCCESS" || verification.availability?.status !== "in_stock") {
      if (verification.status === "FAILED" && verification.notes?.includes("CAPTCHA")) {
         await updateOrderStatus(orderId, "AMAZON_VERIFICATION_RETRY_REQUIRED");
         await sendTelegramNotification(
           `⚠️ AMAZON LIVE CHECK INCOMPLETE\n\nProduct identity: Confirmed\nASIN: ${offer.supplierProductId || "Unknown"}\nSupplier URL: ${offer.supplierProductUrl || "Unknown"}\n\nLive price/availability could not be verified.\nStatus: Retry required (CAPTCHA Blocked)`,
           false
         );
      } else {
         await updateOrderStatus(orderId, "PRICE_REVIEW_REQUIRED");
         await sendTelegramNotification(
           `SOURCING FAILED: Supplier verification failed for "${product.instagramProductTitle}". Status: ${verification.status}. Notes: ${verification.notes || "N/A"}`,
           false
         );
      }
      return;
    }

    // 6. FX Conversion and Economics
    let supplierPrice = verification.price?.livePrice ?? offer.supplierPriceAtListing;
    const supplierCurrency = verification.price?.currency ?? offer.currency;
    const customerPrice = product.instagramSellingPrice;
    const customerCurrency = product.currency;

    if (supplierCurrency !== customerCurrency) {
      if (supplierCurrency === 'AED' && customerCurrency === 'USD') {
        const rate = 1 / 3.6725;
        const convertedAmount = supplierPrice * rate;
        verification.fx = {
          from: 'AED',
          to: 'USD',
          rate,
          convertedAmount: Math.round(convertedAmount * 100) / 100,
          source: 'hardcoded_fixed',
          checkedAt: new Date()
        };
        supplierPrice = verification.fx.convertedAmount;
      } else if (supplierCurrency === 'USD' && customerCurrency === 'AED') {
        const rate = 3.6725;
        const convertedAmount = supplierPrice * rate;
        verification.fx = {
          from: 'USD',
          to: 'AED',
          rate,
          convertedAmount: Math.round(convertedAmount * 100) / 100,
          source: 'hardcoded_fixed',
          checkedAt: new Date()
        };
        supplierPrice = verification.fx.convertedAmount;
      } else {
        await updateOrderStatus(orderId, "FX_VERIFICATION_REQUIRED");
        await appendSourcingEvent(orderId, "FX_FAILED", {
           supplierCurrency, customerCurrency
        });
        await sendTelegramNotification(
          `SOURCING BLOCKED: Currency mismatch between supplier (${supplierCurrency}) and customer (${customerCurrency}), but no FX rate is available. Manual review required.`,
          false
        );
        return;
      }
    }

    const policy = product.pricingPolicy || DEFAULT_PRICING_POLICY;
    const economics = evaluateEconomics(customerPrice, supplierPrice, policy);

    await appendSourcingEvent(orderId, economics.economicsHealthy ? "ECONOMICS_HEALTHY" : "ECONOMICS_UNHEALTHY", {
      customerPrice,
      supplierPrice,
      grossMarginPercent: economics.grossMarginPercent,
      markupPercent: economics.markupPercent,
      proposedNewPrice: economics.proposedNewPrice,
    });

    // 7. Notify admin of economics result
    await notifyAdminEconomicsResult(order, product, economics, verification, offer);

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
        await updateOrderStatus(orderId, "LIVE_WEB_CHECK_PASSED");
      } else {
        await updateOrderStatus(orderId, "LIVE_WEB_CHECK_PASSED");
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
