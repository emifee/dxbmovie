import { getActiveOrderForCustomer, runOrderOrchestrator, updateOrderCollectedInfo, appendConversationRequest, updateOrderStatus } from "@/lib/db/commerce-orders";
import { getConversation, saveConversation } from "@/lib/db/conversations";
import { generateSoniaResponse, SoniaResponse } from "@/lib/ai/sonia";
import { validateFieldAsync } from "@/lib/commerce/orchestrator";

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

  // 4. Call Sonia
  const response = await generateSoniaResponse({
    channel: req.channel,
    userId: req.userId,
    messageHistory: history,
    contextMode: activeOrder ? "commerce" : "movie",
    soniaAction: soniaAction
  });

  // 5. If Sonia extracted fields, validate and run orchestrator
  if (response.extractedOrderFields && activeOrder) {
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
