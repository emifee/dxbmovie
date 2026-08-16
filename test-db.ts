import { MongoClient } from 'mongodb';

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("No MONGODB_URI");
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db("dxbmovies");

  console.log("--- LATEST WEBHOOK EVENTS ---");
  const events = await db.collection("instagram_webhook_events").find().sort({ received_at: -1 }).limit(3).toArray();
  for (const ev of events) {
    console.log(`Event ID: ${ev.event_id}, Type: ${ev.event_type}, Status: ${ev.processing_status}`);
    console.log(`Payload:`, JSON.stringify(ev.payload, null, 2));
    console.log(`Text:`, ev.text);
  }

  console.log("\n--- LATEST COMMERCE ORDERS ---");
  const orders = await db.collection("commerce_orders").find().sort({ created_at: -1 }).limit(3).toArray();
  for (const order of orders) {
    console.log(`Order:`, JSON.stringify(order, null, 2));
  }

  await client.close();
}

run().catch(console.error);
