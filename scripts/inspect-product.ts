import { MongoClient } from 'mongodb';
import * as fs from 'fs';
import * as path from 'path';

// dotenv is not a declared dependency of this project — parse .env.local directly.
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^=#]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, '');
  }
}

async function inspect() {
  const client = new MongoClient(process.env.MONGODB_URI as string);
  await client.connect();
  const db = client.db('dxbmovies');
  const product = await db.collection('commerce_products').findOne({ 
    instagramProductTitle: { $regex: /Microsoft 365/i }
  });
  
  if (product) {
    console.log(JSON.stringify({
      id: product.id,
      fulfillmentType: product.fulfillmentType,
      fulfillmentMethod: product.fulfillmentMethod,
      resaleAuthorized: product.resaleAuthorized,
      orderingEnabled: product.orderingEnabled,
      customerVisible: product.customerVisible,
      purchaseRequirements: product.purchaseRequirements,
    }, null, 2));
  } else {
    console.log("Product not found");
  }
  await client.close();
}

inspect().catch(console.error);
