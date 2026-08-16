const TOKEN = "IGAAe6TxLtbDRBZAGJQdlNjQjAwMklOMWY2RVVmQzI2UWQ3WHVwdTRweXYzLXN0dktDS1V6eW5FX1hwdi1jNVZA1Q19rOTFSNjVUdDFRQ1dINXJoSmJERVdJWWlpREZAUbzBfNHZAkYm8xQVlSRFhHWXQ5N1RHb1RlbG9XZAkc1MEFmcwZDZD";
const MID = "aWdfZAG1faXRlbToxOklHTWVzc2FnZAUlEOjE3ODQxNDMyNjMwNDM5NDcyOjM0MDI4MjM2Njg0MTcxMDMwMTI0NDI2MDM1NjI4NzQ0OTcxMzU3NTozMjk2MTUwMjIxNjU3MDg4MTg3NjM2MzE0MTExODQyNzEzNgZDZD";

async function fetchGraph(path) {
  const url = `https://graph.instagram.com/v20.0/${path}${path.includes('?') ? '&' : '?'}access_token=${TOKEN}`;
  const res = await fetch(url);
  return { status: res.status, body: await res.json() };
}

async function fetchFacebookGraph(path) {
  const url = `https://graph.facebook.com/v20.0/${path}${path.includes('?') ? '&' : '?'}access_token=${TOKEN}`;
  const res = await fetch(url);
  return { status: res.status, body: await res.json() };
}

async function run() {
  console.log("=== 1. Checking /me/permissions (Facebook Graph) ===");
  const fbPerms = await fetchFacebookGraph('me/permissions');
  console.log(JSON.stringify(fbPerms, null, 2));

  console.log("\n=== 2. Checking /me/permissions (Instagram Graph) ===");
  const igPerms = await fetchGraph('me/permissions');
  console.log(JSON.stringify(igPerms, null, 2));
  
  console.log("\n=== 3. Querying Message ID (Facebook Graph) ===");
  const fbMsg = await fetchFacebookGraph(`${MID}?fields=id,created_time,from,to,message,attachments`);
  console.log(JSON.stringify(fbMsg, null, 2));

  console.log("\n=== 4. Querying Message ID (Instagram Graph) ===");
  const igMsg = await fetchGraph(`${MID}?fields=id,created_time,from,to,message,attachments`);
  console.log(JSON.stringify(igMsg, null, 2));

  console.log("\n=== 5. Querying Commerce / Catalogs ===");
  const fbCatalogs = await fetchFacebookGraph('me/catalogs');
  console.log("Catalogs:", JSON.stringify(fbCatalogs, null, 2));
  
  const fbCommerce = await fetchFacebookGraph('me/commerce_merchant_settings');
  console.log("Commerce Settings:", JSON.stringify(fbCommerce, null, 2));
}

run().catch(console.error);
