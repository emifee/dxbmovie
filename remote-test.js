const { MongoClient } = require('mongodb');

async function run() {
  const uri = "mongodb+srv://emifeaustin09_db_user:xjeAnNYKs0SBilwH@dxbmovies.5zdflaq.mongodb.net/dxbmovies?retryWrites=true&w=majority&appName=DXBmovies";
  
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db("dxbmovies");

  console.log("=== LATEST ORDER ===");
  const orders = await db.collection("commerce_orders").find().sort({ created_at: -1 }).limit(1).toArray();
  console.log(JSON.stringify(orders[0], null, 2));

  console.log("\n=== WEBHOOK EVENTS FOR MID ===");
  if (orders.length > 0) {
    const mid = orders[0].native_message_id;
    const events = await db.collection("instagram_webhook_events").find({ event_id: mid }).toArray();
    console.log(JSON.stringify(events, null, 2));
  }

  await client.close();
}
run().catch(console.error);
