import { MongoClient, ObjectId } from "mongodb";

async function run() {
  const uri = process.env.MONGODB_URI || "mongodb+srv://dxbmovies:YVd8xQ35Yl1o5u5C@cluster0.o5hck.mongodb.net/dxbmovies?retryWrites=true&w=majority";
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
