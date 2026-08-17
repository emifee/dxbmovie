import { replyToComment } from "../lib/instagram/client";

async function runDiagnostic() {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) throw new Error("No token");
  const cleanToken = token.replace(/['"]/g, ''); // Ensure no quotes

  const commentId = "18172206874446813"; // Latest comment from khori.moore
  const GRAPH_BASE = "https://graph.facebook.com/v19.0";

  console.log("--- 1. Testing GET Comment ---");
  const getRes = await fetch(`${GRAPH_BASE}/${commentId}?fields=text,username,from`, {
    headers: { Authorization: `Bearer ${cleanToken}` }
  });
  const getData = await getRes.json();
  console.log("GET Response Status:", getRes.status);
  console.log("GET Response Body:", JSON.stringify(getData, null, 2));

  console.log("\n--- 2. Testing POST Reply ---");
  const result = await replyToComment(commentId, "DXB comment diagnostic ✅");
  console.log("POST Result via client.ts:", JSON.stringify(result, null, 2));
}

runDiagnostic().catch(console.error);
