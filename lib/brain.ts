import { getActiveOrderForCustomer, runOrderOrchestrator, updateOrderCollectedInfo, appendConversationRequest, updateOrderStatus } from "@/lib/db/commerce-orders";
import { getConversation, saveConversation } from "@/lib/db/conversations";
import { generateSoniaResponse, SoniaResponse } from "@/lib/ai/sonia";
import { validateFieldAsync } from "@/lib/commerce/orchestrator";

/**
 * Deterministic reply used while a commerce order's product identity is unresolved.
 * Deliberately neutral: we cannot say "unavailable", "confirmed", or anything about
 * price/sourcing, because we do not yet know what the product is.
 */
const PRODUCT_LINKAGE_REQUIRED_MESSAGE =
  "I'm checking the product details before we continue with your order.";

/**
 * Deterministic reply for the turn on which an order becomes READY_FOR_PAYMENT.
 *
 * Truthful by design: no payment provider is integrated yet, so this must not promise a
 * payment link, claim payment details are coming, or say the order is confirmed. It
 * states only what is actually true — we have what we need.
 */
const READY_FOR_PAYMENT_MESSAGE = "Thanks — I have everything needed for your order.";

export interface ProcessMessageRequest {
  userId: string;
  channel: "instagram_dm" | "instagram_comment" | "web";
  text: string;
}

export async function processMessage(req: ProcessMessageRequest): Promise<SoniaResponse> {
  const history = await getConversation(req.userId, req.channel);
  
  if (req.text) {
    history.push({ role: "user", content: req.text });
  }

  let activeOrder = await getActiveOrderForCustomer(req.userId);
  // Status before anything this turn changes it. Used to detect transitions that happen
  // AFTER Sonia has already generated her reply from the pre-extraction state.
  const statusAtTurnStart = activeOrder?.status;
  let soniaAction: any = null;

  if (activeOrder) {
    // 1. Check if we are waiting for a price approval
    if (activeOrder.status === 'PRICE_CHANGE_CUSTOMER_APPROVAL_REQUIRED') {
      const lowerText = req.text.toLowerCase().replace(/[^a-z]/g, "");
      const isYes = ["yes", "yeah", "correct", "yep", "yup", "thatscorrect", "sure", "ok", "okay", "proceed"].includes(lowerText);
      const isNo = ["no", "nope", "cancel", "stop", "dont", "nevermind"].includes(lowerText);

      if (isYes) {
        const { appendSourcingEvent } = await import("@/lib/db/commerce-orders");
        await appendSourcingEvent(activeOrder._id!.toString(), "CUSTOMER_ACCEPTED_REPRICE", {
          proposedPrice: activeOrder.proposedNewPrice,
          proposedCurrency: activeOrder.proposedCurrency,
          repricingVersion: activeOrder.repricingVersion,
          originalCustomerPrice: activeOrder.originalCustomerPrice,
        });
        await updateOrderStatus(activeOrder._id!.toString(), "READY_FOR_PAYMENT");
        activeOrder = await getActiveOrderForCustomer(req.userId);
        soniaAction = { action: "PRICE_APPROVED_READY_FOR_PAYMENT" };
      } else if (isNo) {
        const { appendSourcingEvent } = await import("@/lib/db/commerce-orders");
        await appendSourcingEvent(activeOrder._id!.toString(), "CUSTOMER_REJECTED_REPRICE", {
          proposedPrice: activeOrder.proposedNewPrice,
          proposedCurrency: activeOrder.proposedCurrency,
          repricingVersion: activeOrder.repricingVersion,
        });
        await updateOrderStatus(activeOrder._id!.toString(), "PRICE_REVIEW_REQUIRED");
        activeOrder = await getActiveOrderForCustomer(req.userId);
        soniaAction = { action: "PRICE_REJECTED_CANCELLED" };
      }
    } 
    // 2. Intercept simple "Yes" for a pending clarification
    else if (activeOrder.status === "INFORMATION_REQUIRED" && activeOrder.missingFields && activeOrder.missingFields.length > 0) {
      const topField = activeOrder.missingFields[0];
      const resolution = activeOrder.fieldResolutions?.[topField];
      
      if (resolution?.resolution === "needs_clarification" && resolution.normalizedValue) {
        const lowerText = req.text.toLowerCase().replace(/[^a-z]/g, "");
        if (["yes", "yeah", "correct", "yep", "yup", "thatscorrect", "sure"].includes(lowerText)) {
          console.log(`[brain] Intercepted affirmative confirmation for pending field ${topField}: ${resolution.normalizedValue}`);
          await updateOrderCollectedInfo(activeOrder._id!.toString(), { [topField]: resolution.normalizedValue });
          await appendConversationRequest(activeOrder._id!.toString(), {
            field: topField,
            action: "extracted",
            valueReceived: req.text,
            outcome: "confirmed",
            timestamp: new Date().toISOString()
          });
          await runOrderOrchestrator(activeOrder._id!.toString());
          activeOrder = await getActiveOrderForCustomer(req.userId);
        }
      }
    }

    if (activeOrder) {
      await runOrderOrchestrator(activeOrder._id!.toString());
      activeOrder = await getActiveOrderForCustomer(req.userId);

      if (activeOrder && activeOrder.status === "INFORMATION_REQUIRED" && activeOrder.missingFields && activeOrder.missingFields.length > 0) {
        const topField = activeOrder.missingFields[0];
        const resolution = activeOrder.fieldResolutions?.[topField];
        if (topField === "phone" && resolution?.resolution === "needs_clarification" && resolution.normalizedValue) {
          soniaAction = { 
            action: "CONFIRM_PHONE",
            data: {
              phone: resolution.normalizedValue,
              country: resolution.inferredCountry
            }
          };
        }
      }
    }
  }

  // 3b. Product identity invariant: while the backend cannot resolve which product
  // this order refers to, we collect nothing and infer nothing from the customer.
  const productIdentityUnresolved = activeOrder?.status === "PRODUCT_LINKAGE_REQUIRED";

  // 4. Call Sonia
  const response = await generateSoniaResponse({
    channel: req.channel,
    userId: req.userId,
    messageHistory: history,
    contextMode: activeOrder ? "commerce" : "movie",
    soniaAction: soniaAction
  });

  // 5. If Sonia extracted fields, validate and run orchestrator.
  // Skipped entirely while product identity is unresolved — we must not collect
  // quantity, address, phone, email, or any product-specific field for an unknown product.
  if (response.extractedOrderFields && activeOrder && !productIdentityUnresolved) {
    const validatedFields: any = {};
    for (const [key, value] of Object.entries(response.extractedOrderFields)) {
      if (value === undefined || value === null || value === "") continue;
      
      const validation = await validateFieldAsync(key, value, activeOrder.collected_info, activeOrder);
      
      await appendConversationRequest(activeOrder._id!.toString(), {
        field: key,
        action: "extracted",
        valueReceived: String(value),
        outcome: validation.resolution,
        timestamp: new Date().toISOString()
      });

      if (validation.valid || validation.resolution === "confirmed") {
        validatedFields[key] = validation.normalizedValue !== undefined ? validation.normalizedValue : value;
      } else if (validation.resolution === "needs_clarification" || validation.resolution === "invalid") {
        // Save unclarified values so orchestrator can generate the correct fieldResolutions state
        validatedFields[key] = value;
      }
    }

    if (Object.keys(validatedFields).length > 0) {
      await updateOrderCollectedInfo(activeOrder._id!.toString(), validatedFields);
    }
    
    // Always run orchestrator to update fieldResolutions (e.g. for needs_clarification)
    await runOrderOrchestrator(activeOrder._id!.toString());
    activeOrder = await getActiveOrderForCustomer(req.userId);

    if (activeOrder && activeOrder.status === 'READY_FOR_SOURCING_CHECK') {
       response.content = "Thanks — I have everything I need. I'm checking availability now.";
    }
  }

  // 5a. Same-turn transition into READY_FOR_PAYMENT.
  //
  // Sonia builds her prompt from the order as it was BEFORE this turn's extraction was
  // applied, so on the turn the customer supplies the final required field she is still
  // being told to ask for it. Backend state wins: the response for this turn reflects
  // the state the order is actually in now, and the customer is never asked again for a
  // field the backend has just accepted.
  if (activeOrder?.status === "READY_FOR_PAYMENT" && statusAtTurnStart !== "READY_FOR_PAYMENT") {
    console.log(
      `[brain] order ${activeOrder._id} reached READY_FOR_PAYMENT this turn (was ${statusAtTurnStart}) — using deterministic response`
    );
    response.content = READY_FOR_PAYMENT_MESSAGE;
    response.presentation = undefined;
  }
  
  // 5b. Backend state wins over the model: while product identity is unresolved,
  // replace whatever Sonia generated with the neutral deterministic message so she
  // cannot ask the customer product questions.
  if (productIdentityUnresolved) {
    response.content = PRODUCT_LINKAGE_REQUIRED_MESSAGE;
    response.presentation = undefined;
    response.extractedOrderFields = undefined;
  }

  if (response.explicitAction === "CANCEL_ORDER" && activeOrder) {
      await updateOrderStatus(activeOrder._id!.toString(), "CANCELLED" as any);
  }

  if (response.content?.trim() || response.presentation) {
    history.push({ role: "assistant", content: response.content || "" });
    await saveConversation(req.userId, req.channel, history);
  }

  if (activeOrder && activeOrder.status === 'INFORMATION_REQUIRED' && activeOrder.missingFields && activeOrder.missingFields.length > 0) {
    const topField = activeOrder.missingFields[0];
    const resolution = activeOrder.fieldResolutions?.[topField];
    await appendConversationRequest(activeOrder._id!.toString(), {
      field: topField,
      action: "requested",
      outcome: resolution?.resolution || "missing",
      timestamp: new Date().toISOString()
    });
  }

  return response;
}
