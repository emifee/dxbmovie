const { MongoClient } = require('mongodb');
async function run() {
  const uri = "mongodb+srv://emifeaustin09_db_user:xjeAnNYKs0SBilwH@dxbmovies.5zdflaq.mongodb.net/dxbmovies?retryWrites=true&w=majority&appName=DXBmovies";
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db('dxbmovies');
    const events = await db.collection('instagram_webhook_events').find().sort({_id: -1}).limit(5).toArray();
    console.log("Events found:", events.length);
    console.log(JSON.stringify(events, null, 2));
  } finally {
    await client.close();
  }
}
run().catch(console.dir);
