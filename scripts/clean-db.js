import { MongoClient, ObjectId } from "mongodb";

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("Missing MONGODB_URI");
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db("dxbmovies");
    const users = await db.collection("users").find().toArray();
    console.log("Users:", users.map(u => ({ id: u._id.toString(), email: u.email, name: u.name, country: u.country })));
  } catch (err) {
    console.error(err);
  } finally {
    await client.close();
  }
}
run();
