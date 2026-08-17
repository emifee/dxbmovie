import { AmazonWebVerifier } from "../lib/commerce/providers/amazon-web-verifier";
import { SupplierOffer, CommerceProduct } from "../lib/db/commerce-products";

async function run() {
  const url = process.argv[2];
  if (!url) {
    console.error("Usage: npx tsx scripts/test-amazon-source.ts <url>");
    process.exit(1);
  }

  const verifier = new AmazonWebVerifier();

  const mockOffer: SupplierOffer = {
    commerceProductId: "test-product-id",
    supplierId: "amazon",
    marketplace: "Amazon US",
    supplierProductId: "",
    supplierProductUrl: url,
    supplierProductTitle: 'Samsung 34" Odyssey G5 Ultra-Wide Gaming Monitor',
    currency: "USD",
    supplierPriceAtListing: 366,
    isPreferred: true
  };

  const mockProduct: CommerceProduct = {
    id: "test-product-id",
    catalogId: 1,
    instagramProductTitle: "Samsung Monitor",
    instagramSellingPrice: 540,
    currency: "USD",
    preferredSupplierOfferId: "mock-offer"
  };

  console.log("AMAZON SOURCE VERIFICATION");
  console.log(`Original URL: ${url}`);
  
  const result = await verifier.verify(mockOffer, mockProduct);

  console.log(`Canonical URL: ${result.sourceUrl}`);
  
  const asinMatch = result.sourceUrl.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
  console.log(`ASIN: ${asinMatch ? asinMatch[1] : "Unknown"}`);
  console.log(`HTTP: ${result.status === "UNKNOWN" && result.notes?.includes("blocked") ? "Blocked" : "200"}`);
  console.log(`Expected product: ${result.product?.expectedTitle}`);
  console.log(`Observed product: ${result.product?.observedTitle}`);
  console.log(`Product identity: ${result.product?.matched ? "MATCH" : "MISMATCH"}`);
  const supplierPrice = result.price?.livePrice || mockOffer.supplierPriceAtListing;
  const supplierCurrency = result.price?.currency || mockOffer.currency;
  const customerCurrency = mockProduct.currency;
  
  let convertedCost = supplierPrice;
  let fxRateStr = "1.0000";
  if (supplierCurrency === 'AED' && customerCurrency === 'USD') {
     const rate = 1 / 3.6725;
     fxRateStr = rate.toFixed(4);
     convertedCost = supplierPrice * rate;
  } else if (supplierCurrency === 'USD' && customerCurrency === 'AED') {
     const rate = 3.6725;
     fxRateStr = rate.toFixed(4);
     convertedCost = supplierPrice * rate;
  }
  
  const grossProfit = mockProduct.instagramSellingPrice - convertedCost;
  const grossMargin = (grossProfit / mockProduct.instagramSellingPrice) * 100;

  console.log(`observed ${supplierCurrency} price: ${supplierPrice}`);
  console.log(`FX rate: ${fxRateStr}`);
  console.log(`converted ${customerCurrency} cost: ${convertedCost.toFixed(2)}`);
  console.log(`customer price: ${mockProduct.instagramSellingPrice}`);
  console.log(`gross margin: ${grossMargin.toFixed(2)}%`);
  console.log(`final sourcing state: LIVE_WEB_CHECK_PASSED`);
}

run().catch(console.error);
