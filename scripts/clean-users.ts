import { MongoClient } from "mongodb";
import { readFileSync } from "fs";
import { join } from "path";

// Manually parse .env.local
function loadEnv() {
  try {
    const content = readFileSync(join(process.cwd(), ".env.local"), "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      process.env[key] = val;
    }
  } catch (e) {
    console.warn("Could not read .env.local:", e);
  }
}

loadEnv();

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("❌ No MONGODB_URI found in .env.local");
    process.exit(1);
  }

  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log("✅ Connected to MongoDB.");
    const db = client.db("dxbmovies");
    const usersCol = db.collection("users");
    const sessionsCol = db.collection("sessions");
    const accountsCol = db.collection("accounts");

    const users = await usersCol.find().sort({ _id: 1 }).toArray();
    console.log(`\nFound ${users.length} user(s):`);
    users.forEach((u, i) => {
      console.log(`  ${i + 1}. email=${u.email ?? "N/A"}, name=${u.name ?? "N/A"}, country=${u.country ?? "not set"}`);
    });

    // Remove users that have no email (orphaned adapter docs)
    const noEmail = users.filter((u) => !u.email || u.email.trim() === "");
    if (noEmail.length > 0) {
      console.log(`\n🗑️  Deleting ${noEmail.length} user(s) with no email...`);
      for (const u of noEmail) {
        await usersCol.deleteOne({ _id: u._id });
        await sessionsCol.deleteMany({ userId: u._id.toString() });
        await accountsCol.deleteMany({ userId: u._id.toString() });
        console.log(`  Deleted: ${u._id}`);
      }
    } else {
      console.log("\n✅ No orphaned users without email found.");
    }

    // Clean up expired sessions
    const now = new Date();
    const staleResult = await sessionsCol.deleteMany({ expires: { $lt: now } });
    if (staleResult.deletedCount > 0) {
      console.log(`\n🧹 Deleted ${staleResult.deletedCount} expired session(s).`);
    }

    const finalUsers = await usersCol.find().toArray();
    console.log(`\n📊 Final user count: ${finalUsers.length}`);
    finalUsers.forEach((u) => console.log(`  - ${u.email} | country: ${u.country ?? "not set"}`));

    console.log("\n✅ Done!");
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await client.close();
  }
}

run();
