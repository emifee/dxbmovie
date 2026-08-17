import { MongoClient } from 'mongodb';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
  const uri = process.env.MONGODB_URI as string;
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db('dxbmovies');
  
  // Find the Samsung product
  const product = await db.collection('commerce_products').findOne({ instagramProductTitle: /Samsung/i });
  if (!product) {
    console.log("Samsung product not found.");
    process.exit(1);
  }
  
  console.log("Found product:", product.instagramProductTitle, "ID:", product.id);
  
  // Find the mapping
  const mapping = await db.collection('instagram_mappings').findOne({ commerceProductId: product.id });
  
  if (mapping) {
    console.log("Mapping already exists:");
    console.log("normalizedInstagramTitle:", mapping.normalizedInstagramTitle);
    console.log("commerceProductId:", mapping.commerceProductId);
    console.log("supplierOfferId:", mapping.supplierOfferId);
    console.log("instagramProductId:", mapping.instagramProductId);
    console.log("instagramMediaId:", mapping.instagramMediaId);
  } else {
    console.log("Mapping missing. Backfilling...");
    const offers = await db.collection('supplier_offers').find({ commerceProductId: product.id }).toArray();
    const offer = offers.find(o => o._id.toString() === product.preferredSupplierOfferId) || offers[0];
    
    if (!offer) {
      console.log("No supplier offer found for backfill.");
      process.exit(1);
    }
    
    const { normalizeTitle } = await import('../lib/db/instagram-mappings');
    const newMapping = {
      commerceProductId: product.id,
      supplierOfferId: offer._id.toString(),
      normalizedInstagramTitle: normalizeTitle(product.instagramProductTitle),
      instagramProductId: product.instagramProductId,
      instagramMediaId: product.instagramMediaId,
      created_at: new Date(),
      updated_at: new Date()
    };
    
    await db.collection('instagram_mappings').insertOne(newMapping);
    console.log("Mapping created successfully:");
    console.log("normalizedInstagramTitle:", newMapping.normalizedInstagramTitle);
    console.log("commerceProductId:", newMapping.commerceProductId);
    console.log("supplierOfferId:", newMapping.supplierOfferId);
    console.log("instagramProductId:", newMapping.instagramProductId);
    console.log("instagramMediaId:", newMapping.instagramMediaId);
  }
  
  process.exit(0);
}

main().catch(console.error);
