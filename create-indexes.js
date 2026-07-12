const { MongoClient } = require('mongodb');
const fs = require('fs');

async function run() {
  let uri = '';
  try {
    const envFile = fs.readFileSync('.env.local', 'utf8');
    const match = envFile.match(/MONGODB_URI=(.*)/);
    if (match) uri = match[1].trim();
  } catch(e) {}
  
  if (!uri) {
    try {
      const envFile = fs.readFileSync('.env', 'utf8');
      const match = envFile.match(/MONGODB_URI=(.*)/);
      if (match) uri = match[1].trim();
    } catch(e) {}
  }
  
  if (!uri) {
    console.error("No MONGODB_URI found");
    process.exit(1);
  }
  
  console.log("Connecting to:", uri.substring(0, 20) + "...");
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db('dxbmovies');
    
    console.log("Creating indexes...");
    await db.collection("users").createIndex({ username: 1 }, { background: true });
    await db.collection("userPreferences").createIndex({ userId: 1 }, { background: true });
    await db.collection("watchlists").createIndex({ userId: 1 }, { background: true });
    await db.collection("chatSessions").createIndex({ userId: 1 }, { background: true });
    
    console.log("Indexes created successfully.");
  } catch(e) {
    console.error(e);
  } finally {
    await client.close();
  }
}
run();
