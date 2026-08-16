const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8');
const match = env.match(/INSTAGRAM_ACCESS_TOKEN=(.*)/);
let accessToken = match ? match[1].trim() : '';

// remove quotes if any
if (accessToken.startsWith('"') && accessToken.endsWith('"')) {
  accessToken = accessToken.slice(1, -1);
}

const orderId = '4337955949788439';

async function checkOrder() {
  const url = `https://graph.facebook.com/v20.0/${orderId}?access_token=${accessToken}`;
  console.log(`Fetching ${url.replace(accessToken, 'HIDDEN_TOKEN')}...`);
  try {
    const res = await fetch(url);
    const data = await res.json();
    console.log("Order Fetch Response:", JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Fetch Error:", err);
  }
}

async function checkCommerceAccount() {
  try {
    const meRes = await fetch(`https://graph.facebook.com/v20.0/me?access_token=${accessToken}`);
    const meData = await meRes.json();
    console.log("Me Response:", JSON.stringify(meData, null, 2));
    
    if (meData.id) {
      // Try to get Commerce Merchant Settings
      // CMS endpoint: GET /{page_id}/commerce_merchant_settings
      const cmsRes = await fetch(`https://graph.facebook.com/v20.0/${meData.id}/commerce_merchant_settings?access_token=${accessToken}`);
      const cmsData = await cmsRes.json();
      console.log("Commerce Merchant Settings Response:", JSON.stringify(cmsData, null, 2));
    }
  } catch (err) {
    console.error("Account Fetch Error:", err);
  }
}

async function run() {
  await checkOrder();
  await checkCommerceAccount();
}

run();
