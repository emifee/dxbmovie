import { MongoClient } from "mongodb";

async function run() {
  const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db("dxbmovies");
  
  // Try shadow_logs
  console.log("=== SHADOW LOGS ===");
  const logs = await db.collection("shadow_logs").find().sort({ timestamp: -1 }).limit(10).toArray();
  logs.forEach(l => console.log(l));

  // Try conversations
  console.log("=== RECENT CONVERSATIONS ===");
  const convs = await db.collection("conversations").find().sort({ "updatedAt": -1 }).limit(2).toArray();
  for (const c of convs) {
    console.log(`User: ${c.userId}, Channel: ${c.channel}`);
    console.log(JSON.stringify(c.messages.slice(-4), null, 2));
  }
  
  await client.close();
}
run().catch(console.error);
