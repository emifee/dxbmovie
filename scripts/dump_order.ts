import { MongoClient } from "mongodb";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

async function run() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db("dxbmovies");
  const docs = await db.collection("commerce_orders").find().sort({_id:-1}).limit(1).toArray();
  console.log(JSON.stringify(docs, null, 2));
  await client.close();
}
run();
