import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;

if (!uri && process.env.NODE_ENV !== "test") {
  console.warn("MONGODB_URI is not set — MongoDB features will not work.");
}

let clientPromise: Promise<MongoClient>;

if (process.env.NODE_ENV === "development") {
  // Reuse across HMR reloads in development to avoid exhausting connections.
  const globalWithMongo = global as typeof globalThis & {
    _mongoClientPromise?: Promise<MongoClient>;
  };
  if (!globalWithMongo._mongoClientPromise) {
    const client = new MongoClient(uri!);
    globalWithMongo._mongoClientPromise = client.connect();
  }
  clientPromise = globalWithMongo._mongoClientPromise;
} else {
  const client = new MongoClient(uri!);
  clientPromise = client.connect();
}

export default clientPromise;
