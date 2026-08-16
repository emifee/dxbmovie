const { MongoClient } = require('mongodb');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
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
    const events = await db.collection("instagram_webhook_events")
      .find({})
      .sort({ received_at: -1 })
      .limit(50)
      .toArray();

    // Group by event type
    const types = {};
    events.forEach(e => {
      types[e.event_type] = (types[e.event_type] || 0) + 1;
    });
    console.log("Event types found:", types);

    // Look for unusual events or payloads that look like an order
    const unusual = events.filter(e => 
      e.payload && 
      (JSON.stringify(e.payload).toLowerCase().includes('order') ||
       JSON.stringify(e.payload).toLowerCase().includes('product') ||
       JSON.stringify(e.payload).toLowerCase().includes('story_model'))
    );
    
    console.log(`Found ${unusual.length} events containing 'order' or 'product'`);
    if (unusual.length > 0) {
      console.log(JSON.stringify(unusual[0].payload, null, 2));
    }

  } finally {
    await client.close();
  }
}
run().catch(console.dir);
