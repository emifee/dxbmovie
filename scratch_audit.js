const { MongoClient } = require('mongodb');

async function auditWebhooks() {
  const uri = process.env.MONGODB_URI;
  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    const db = client.db('dxbmovies');
    
    // Dubai is UTC+4. 
    // 8:00 AM Dubai = 4:00 AM UTC
    // 8:15 AM Dubai = 4:15 AM UTC
    const startTime = new Date('2026-08-16T04:00:00Z');
    const endTime = new Date('2026-08-16T04:15:00Z');
    
    const events = await db.collection('instagram_webhook_events').find({
      received_at: {
        $gte: startTime,
        $lte: endTime
      }
    }).sort({ timestamp: 1 }).toArray();
    
    console.log(`Found ${events.length} events between ${startTime.toISOString()} and ${endTime.toISOString()}`);
    
    events.forEach(event => {
      console.log('--- Event ---');
      console.log(`Time: ${event.received_at}`);
      console.log(`Event Type: ${event.event_type}`);
      console.log(`Body: ${JSON.stringify(event.payload, null, 2)}`);
    });
    
  } finally {
    await client.close();
  }
}

auditWebhooks().catch(console.error);
