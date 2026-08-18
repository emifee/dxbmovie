import { CommerceOrder, updateOrderStatus, appendSourcingEvent, claimOrderForSourcing } from "@/lib/db/commerce-orders";
import { CommerceProduct } from "@/lib/db/commerce-products";
import { sendTelegramNotification } from "@/lib/commerce/telegram";

/**
 * Determines the mandatory fields required for a digital product.
 * Overrides any LLM inference to ensure determinism based on the fulfillment method.
 */
export function resolveDigitalRequirements(product: CommerceProduct): string[] {
  let fields = ["quantity"];
  const method = product.fulfillmentMethod || "manual_delivery";

  switch (method) {
    case "download_url":
    case "license_key":
    case "account_access":
      fields.push("email");
      break;
    case "API_delivery":
    case "manual_delivery":
    default:
      // Rely on explicitly configured fields for these, or fallback to quantity only
      break;
  }
  
  // Merge explicit purchaseRequirements from DB if they exist
  if (product.purchaseRequirements?.requiredFields) {
    fields = Array.from(new Set([...fields, ...product.purchaseRequirements.requiredFields]));
  }

  return fields;
}

/**
 * Executes the eligibility check for digital orders, bypassing physical Amazon logic.
 */
export async function checkDigitalEligibility(order: CommerceOrder, product: CommerceProduct): Promise<void> {
  const orderId = order._id!.toString();

  // 1. Atomic claim to prevent race conditions
  const claimedOrder = await claimOrderForSourcing(orderId);
  
  if (!claimedOrder) {
    console.log(`[DigitalEligibility] Order ${orderId} is already claimed by another process. Skipping.`);
    return;
  }

  await appendSourcingEvent(orderId, "DIGITAL_ELIGIBILITY_CHECK_STARTED", {
    triggeredAt: new Date().toISOString(),
    attemptId: claimedOrder.sourcingAttemptId,
  });

  // 2. Verify eligibility
  let eligible = true;
  let reason = "";

  if (product.status !== "active") {
    eligible = false;
    reason = "Product is not active";
  } else if (!product.orderingEnabled) {
    eligible = false;
    reason = "Ordering is not enabled for this product";
  } else if (!product.customerVisible) {
    eligible = false;
    reason = "Product is not visible to customers";
  } else if (product.fulfillmentType !== "digital") {
    eligible = false;
    reason = "Product is not marked as digital";
  } else if (product.resaleAuthorized !== true) {
    eligible = false;
    reason = "Resale is not authorized for this product";
  } else if (!product.fulfillmentMethod) {
    eligible = false;
    reason = "Fulfillment method is missing";
  }

  if (!eligible) {
    await updateOrderStatus(orderId, "ORDER_NOT_AVAILABLE");
    await appendSourcingEvent(orderId, "DIGITAL_ELIGIBILITY_FAILED", { reason });
    
    await sendTelegramNotification(
      `❌ DIGITAL PRODUCT UNAVAILABLE\n\nOrder: ${orderId}\nProduct: ${product.instagramProductTitle}\n\nReason: ${reason}`,
      false
    );
    return;
  }

  // 3. Eligible! Transition to READY_FOR_PAYMENT
  await appendSourcingEvent(orderId, "DIGITAL_ELIGIBILITY_VERIFIED", {
    fulfillmentMethod: product.fulfillmentMethod
  });
  await updateOrderStatus(orderId, "READY_FOR_PAYMENT");

  const collected = order.collected_info || {};
  const emailStr = collected.email || "N/A";
  
  await sendTelegramNotification(
    `💻 DIGITAL ORDER\n\nPRODUCT\n${product.instagramProductTitle || order.displayed_product_title}\n\nCUSTOMER\nInstagram: @${order.customer_igsid || "unknown"}\nQuantity: ${collected.quantity || "1"}\nEmail: ${emailStr}\n\nFULFILLMENT\nMethod: ${product.fulfillmentMethod}\nResale authorization: verified\n\nSTATUS\n✅ Digital eligibility passed\nReady for payment`,
    false
  );
}
