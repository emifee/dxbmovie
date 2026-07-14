// One-time cleanup script: removes orphaned accounts (accounts with no matching user doc)
// Run with: node scripts/cleanup-orphaned-accounts.mjs

import { MongoClient, ObjectId } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) throw new Error("Missing MONGODB_URI environment variable");
const DB_NAME = "dxbmovies";

async function run() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(DB_NAME);

  const users = await db.collection("users").find({}, { projection: { _id: 1 } }).toArray();
  const userIds = new Set(users.map((u) => u._id.toString()));

  console.log(`\nFound ${users.length} users: ${[...userIds].join(", ")}`);

  const accounts = await db.collection("accounts").find({}).toArray();
  console.log(`Found ${accounts.length} accounts.`);

  const orphans = accounts.filter((a) => !userIds.has(a.userId?.toString()));

  if (orphans.length === 0) {
    console.log("✅  No orphaned accounts found. Database is clean!");
    await client.close();
    return;
  }

  console.log(`\n⚠️  Found ${orphans.length} orphaned account(s):`);
  orphans.forEach((o) => {
    console.log(`  - Account _id: ${o._id}, userId: ${o.userId}, provider: ${o.provider}`);
  });

  const orphanIds = orphans.map((o) => o._id);
  const result = await db.collection("accounts").deleteMany({ _id: { $in: orphanIds } });
  console.log(`\n🗑️  Deleted ${result.deletedCount} orphaned account(s).`);

  const remainingAccounts = await db.collection("accounts").countDocuments();
  const remainingUsers = await db.collection("users").countDocuments();
  console.log(`\n✅  Cleanup complete!`);
  console.log(`   Users:    ${remainingUsers}`);
  console.log(`   Accounts: ${remainingAccounts}`);

  if (remainingUsers !== remainingAccounts) {
    console.warn("⚠️  Warning: user and account counts still don't match. Manual review needed.");
  }

  await client.close();
}

run().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
