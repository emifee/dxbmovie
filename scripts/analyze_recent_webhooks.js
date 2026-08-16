const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

const envFile = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf8');
const mongoUriMatch = envFile.match(/MONGODB_URI=(.*)/);
const uri = mongoUriMatch ? mongoUriMatch[1].replace(/['"]/g, '').trim() : null;

async function run() {
  if (!uri) {
    console.error("No MONGODB_URI found");
    return;
  }
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db("dxbmovies");
    
    // Search last 30 minutes
    const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000);
    
    const events = await db.collection("instagram_webhook_events")
      .find({ received_at: { $gte: thirtyMinsAgo } })
      .sort({ received_at: -1 })
      .toArray();

    console.log(`Total events in the last 30 mins: ${events.length}`);
    
    events.forEach(e => {
      console.log(`\n--- Event received at ${e.received_at} ---`);
      console.log(`Type: ${e.event_type}`);
      // Remove noisy fields if it's just a regular message, but we want to see the whole payload.
      // Let's print the entire raw payload that was saved.
      console.log(JSON.stringify(e.payload, null, 2));
    });

  } finally {
    await client.close();
  }
}
run().catch(console.dir);
