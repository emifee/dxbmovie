import * as fs from 'fs';
import * as path from 'path';

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, 'utf8');
  envConfig.split('\n').forEach((line) => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      process.env[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '');
    }
  });
}

import { MongoClient, ObjectId } from 'mongodb';
import { generateSoniaResponse } from '../lib/ai/sonia';
import { CommerceOrder, getActiveOrderForCustomer, runOrderOrchestrator, calculateOrderState } from '../lib/db/commerce-orders';
import { assertSafeCustomerMessage } from '../lib/instagram/renderer';

async function resetAndCreateOrder(customerIgsid: string): Promise<ObjectId> {
  const client = new MongoClient(process.env.MONGODB_URI as string, { tlsAllowInvalidCertificates: true, serverSelectionTimeoutMS: 5000 });
  await client.connect();
  const db = client.db('dxbmovies');
  
  await db.collection('commerce_orders').deleteMany({ customer_igsid: customerIgsid });
  
  const orderObj: Omit<CommerceOrder, '_id' | 'created_at' | 'updated_at'> = {
    customer_igsid: customerIgsid,
    native_message_id: "test_mid_" + Date.now(),
    displayed_product_title: "PlayStation 5 Pro",
    displayed_price: "AED 2500",
    status: "INFORMATION_REQUIRED",
    productCategory: "Electronics",
    requiredFields: ["quantity", "shippingAddress", "phone"],
    missingFields: ["quantity", "shippingAddress", "phone"],
    collected_info: {},
  };
  
  const result = await db.collection('commerce_orders').insertOne({
    ...orderObj,
    created_at: new Date(),
    updated_at: new Date()
  });
  
  await client.close();
  return result.insertedId;
}

async function simulateTurn(igsid: string, userMessage: string, history: any[] = []) {
  console.log(`\n\n--- INBOUND_DM: "${userMessage}" ---`);
  
  let orderBefore = await getActiveOrderForCustomer(igsid);
  console.log(`ACTIVE_ORDER_FOUND: ${orderBefore ? 'Yes' : 'No'} (Status: ${orderBefore?.status})`);
  
  const req = {
    channel: "instagram",
    userId: igsid,
    messageHistory: [
      ...history,
      { role: "user", content: userMessage }
    ],
    contextMode: "commerce" as any
  };

  const response = await generateSoniaResponse(req);
  console.log(`EXTRACTION_RESULT: \n${JSON.stringify(response.extractedOrderFields || {}, null, 2)}`);
  
  // Handlers.ts Logic Replication
  let finalOrderState = await getActiveOrderForCustomer(igsid);
  if (finalOrderState) {
    console.log(`ORDER_BEFORE:`, JSON.stringify(finalOrderState.collected_info));
    await runOrderOrchestrator(finalOrderState._id!.toString());
    finalOrderState = await getActiveOrderForCustomer(igsid);
    
    console.log(`STATE_TRANSITION: ${orderBefore?.status} -> ${finalOrderState?.status}`);
    
    if (finalOrderState) {
      if (finalOrderState.status === "READY_FOR_SOURCING_CHECK") {
        response.content = "Thanks — I have everything I need. I'm checking availability now.";
        console.log(`TELEGRAM_PHASE1_RESULT: Triggered`);
      } else if (finalOrderState.status === "PAID") {
        response.content = "Payment received. We are processing your order.";
      } else if (finalOrderState.status === "INFORMATION_REQUIRED") {
        const forbiddenPhrases = ["order confirmed", "being processed", "confirmation shortly", "payment received"];
        if (response.content && forbiddenPhrases.some(p => response.content.toLowerCase().includes(p))) {
          console.log(`[BLOCKED AI HALLUCINATION]`);
          response.content = "I'm checking that for you.";
        }
      }
    }
  }

  // Renderer guard replication
  const originalContent = response.content;
  response.content = assertSafeCustomerMessage(response.content || "");
  if (originalContent !== response.content) {
    console.log(`[GUARD TRIGGERED] Sanitized outbound message.`);
  }

  console.log(`ORDER_AFTER:`, JSON.stringify(finalOrderState?.collected_info));
  if (finalOrderState?.fieldResolutions) {
    console.log(`FIELD_VALIDATION_RESULT:`);
    for (const [k, v] of Object.entries(finalOrderState.fieldResolutions)) {
      console.log(`  - ${k}: ${v.resolution} (norm: ${JSON.stringify(v.normalizedValue)})`);
    }
  }
  
  console.log(`\nOUTBOUND_CUSTOMER_MESSAGE:\n"${response.content}"`);
  
  // Regression assertions
  if (response.content.includes("{") || response.content.includes("shippingAddress")) {
    throw new Error("REGRESSION: JSON leaked to user!");
  }
  if (response.content.toLowerCase().includes("order confirmed") && finalOrderState?.status !== "READY_FOR_PAYMENT" && finalOrderState?.status !== "PAID") {
    throw new Error("REGRESSION: Sonia promised order confirmed prematurely!");
  }

  return { response, freshOrder: finalOrderState };
}

async function runTests() {
  console.log("Starting Regression Tests...\n");

  console.log("=========================================");
  console.log("TEST: Regression Flow (Nigeria Address & Phone)");
  const igsid = "test_regression_flow";
  await resetAndCreateOrder(igsid);
  let history: any[] = [];
  
  // Quantity
  await simulateTurn(igsid, "1", history);
  history.push({ role: "user", content: "1" });
  history.push({ role: "assistant", content: "Great! Where should we deliver it?" });
  
  // Address
  await simulateTurn(igsid, "53 Salami, Oworonshoki, Lagos State", history);
  history.push({ role: "user", content: "53 Salami, Oworonshoki, Lagos State" });
  history.push({ role: "assistant", content: "Thanks! What's the best phone number for delivery?" });
  
  // Phone
  const { freshOrder } = await simulateTurn(igsid, "08169875198", history);
  history.push({ role: "user", content: "08169875198" });
  
  let expectedReply = "Just confirming — +234 816 987 5198, right?";
  if (freshOrder?.fieldResolutions?.['phone']?.normalizedValue) {
      expectedReply = `Just confirming — ${freshOrder?.fieldResolutions?.['phone']?.normalizedValue}, right?`;
  }
  history.push({ role: "assistant", content: expectedReply });
  
  // Confirmation
  const { freshOrder: finalOrder, response: finalRes } = await simulateTurn(igsid, "Yes", history);
  
  if (finalOrder?.status !== "READY_FOR_SOURCING_CHECK") {
    throw new Error(`REGRESSION: Order did not transition to READY_FOR_SOURCING_CHECK. Status is ${finalOrder?.status}`);
  }
  
  if (finalRes.content !== "Thanks — I have everything I need. I'm checking availability now.") {
    throw new Error(`REGRESSION: Did not output the exact sourcing check message!`);
  }

  console.log("\nAll Regression Tests Passed.");
  process.exit(0);
}

runTests().catch(e => {
  console.error(e);
  process.exit(1);
});
