import { MongoClient, ObjectId } from 'mongodb';
import { generateSoniaResponse } from '../lib/ai/sonia';
import { CommerceOrder, getActiveOrderForCustomer, createCommerceOrder, updateOrderStatus } from '../lib/db/commerce-orders';
// Ensure you have MONGO_URI and GROQ_API_KEY exported in your terminal
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

async function resetAndCreateOrder(customerIgsid: string): Promise<ObjectId> {
  const client = new MongoClient(process.env.MONGODB_URI as string, { tlsAllowInvalidCertificates: true, serverSelectionTimeoutMS: 5000 });
  await client.connect();
  const db = client.db('dxbmovies');
  
  // Clean up any existing order for this customer
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
  console.log(`\n\n--- Customer: "${userMessage}" ---`);
  
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
  
  console.log("Sonia Response:", JSON.stringify(response, null, 2));
  
  const freshOrder = await getActiveOrderForCustomer(igsid);
  console.log(`DB State:`);
  console.log(`  - status: ${freshOrder?.status}`);
  console.log(`  - missingFields: ${freshOrder?.missingFields?.join(", ")}`);
  console.log(`  - collected_info:`, freshOrder?.collected_info);
  if (freshOrder?.fieldResolutions) {
    console.log(`  - fieldResolutions:`);
    for (const [k, v] of Object.entries(freshOrder.fieldResolutions)) {
      console.log(`      ${k}: ${v.resolution} (raw: ${v.rawValue}, norm: ${v.normalizedValue})`);
    }
  }
  
  return { response, freshOrder };
}

async function runTests() {
  console.log("Starting Conversational Tests...\n");

  // TEST 1: Phone Flow
  console.log("=========================================");
  console.log("TEST 1: Phone Flow (UAE inference)");
  const igsid1 = "test_phone_flow";
  await resetAndCreateOrder(igsid1);
  let history1: any[] = [];
  
  await simulateTurn(igsid1, "I need 1 to Dubai Marina", history1);
  history1.push({ role: "user", content: "I need 1 to Dubai Marina" });
  history1.push({ role: "assistant", content: "Great! Just need your phone number." });
  
  await simulateTurn(igsid1, "0551994544", history1);
  history1.push({ role: "user", content: "0551994544" });
  history1.push({ role: "assistant", content: "Just confirming — +971 55 199 4544, right?" });
  
  await simulateTurn(igsid1, "Yes", history1);

  // TEST 2: Interruption
  console.log("=========================================");
  console.log("TEST 2: Interruption");
  const igsid2 = "test_interruption";
  await resetAndCreateOrder(igsid2);
  let history2: any[] = [];
  
  await simulateTurn(igsid2, "I need 1", history2);
  history2.push({ role: "user", content: "I need 1" });
  history2.push({ role: "assistant", content: "Great! Where should we deliver it?" });
  
  await simulateTurn(igsid2, "Is this the slim version or original?", history2);
  
  // TEST 3: Hesitation
  console.log("=========================================");
  console.log("TEST 3: Hesitation (Soft Recovery)");
  const igsid3 = "test_hesitation";
  await resetAndCreateOrder(igsid3);
  let history3: any[] = [];
  
  await simulateTurn(igsid3, "Actually forget it", history3);

  // TEST 4: Hard No
  console.log("=========================================");
  console.log("TEST 4: Hard No (Immediate Cancellation)");
  const igsid4 = "test_hard_no";
  await resetAndCreateOrder(igsid4);
  let history4: any[] = [];
  
  await simulateTurn(igsid4, "Cancel my order. I don't want anything else.", history4);

  // TEST 5: Multi-field Message
  console.log("=========================================");
  console.log("TEST 5: Multi-field Message");
  const igsid5 = "test_multifield";
  await resetAndCreateOrder(igsid5);
  let history5: any[] = [];
  
  await simulateTurn(igsid5, "I need one, deliver to Dubai Marina and my number is 0551994544", history5);

  // TEST 6: Multi-intent Interruption
  console.log("=========================================");
  console.log("TEST 6: Multi-intent Interruption");
  const igsid6 = "test_multi_intent";
  await resetAndCreateOrder(igsid6);
  let history6: any[] = [];
  
  await simulateTurn(igsid6, "I need 1", history6);
  history6.push({ role: "user", content: "I need 1" });
  history6.push({ role: "assistant", content: "Great! Where should we deliver it?" });
  
  await simulateTurn(igsid6, "Dubai Marina. Btw is this actually good for PS5 or should I get something else?", history6);

  console.log("\nDone.");
  process.exit(0);
}

runTests().catch(console.error);
