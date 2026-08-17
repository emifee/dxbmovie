import clientPromise from "../lib/mongodb";
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

async function migrate() {
  const client = await clientPromise;
  const db = client.db("dxbmovies");
  
  console.log("Migrating physical products...");
  
  // Find all existing products (which are physical)
  const result = await db.collection("commerce_products").updateMany(
    { fulfillmentType: { $exists: false } },
    { 
      $set: { 
        fulfillmentType: "physical",
        customerVisible: false,
        orderingEnabled: false
      }
    }
  );
  
  // Make sure Samsung test product is also updated if it already has fulfillmentType
  const resultSamsung = await db.collection("commerce_products").updateMany(
    { instagramProductTitle: { $regex: /Samsung/i } },
    { 
      $set: { 
        fulfillmentType: "physical",
        customerVisible: false,
        orderingEnabled: false
      }
    }
  );

  console.log(`Updated ${result.modifiedCount} legacy physical products.`);
  console.log(`Updated ${resultSamsung.modifiedCount} Samsung physical products.`);
  console.log("Migration complete.");
  process.exit(0);
}

migrate().catch(console.error);
