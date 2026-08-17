import { CommerceProduct } from "@/lib/db/commerce-products";
import { resolveProductRequirements, validateField } from "@/lib/commerce/orchestrator";

const mockProducts: Record<string, CommerceProduct> = {
  "prod_samsung": {
    id: "prod_samsung",
    instagramProductTitle: "Samsung Odyssey G5 34\"",
    currency: "USD",
    instagramSellingPrice: 540,
    category: "electronics",
    fulfillmentType: "physical",
    purchaseRequirements: {
      requiredFields: ["quantity", "shippingAddress", "phone"],
      fixedAttributes: { screenSize: "34 inch" },
      selectableAttributes: {}
    }
  },
  "prod_adobe": {
    id: "prod_adobe",
    instagramProductTitle: "Adobe Lightroom 1-Year Digital License",
    currency: "USD",
    instagramSellingPrice: 120,
    category: "software",
    fulfillmentType: "digital",
    purchaseRequirements: {
      requiredFields: ["quantity", "email"],
      fixedAttributes: {},
      selectableAttributes: {}
    }
  },
  "prod_dm_code": {
    id: "prod_dm_code",
    instagramProductTitle: "100 V-Bucks Code",
    currency: "USD",
    instagramSellingPrice: 10,
    category: "gaming",
    fulfillmentType: "digital",
    purchaseRequirements: {
      requiredFields: ["quantity"],
      fixedAttributes: {},
      selectableAttributes: {}
    }
  }
};

function calculateMockState(product: any) {
  const reqs = resolveProductRequirements(product, product.category);
  const collected = {};
  const missingFields: string[] = [];

  for (const field of reqs.requiredFields) {
    if (reqs.fixedAttributes && field in reqs.fixedAttributes) {
      continue;
    }
    const validation = validateField(field, (collected as any)[field]);
    if (!validation.valid) {
      missingFields.push(field);
    }
  }

  return { missingFields };
}

async function testRequirements() {
  console.log("=== Testing Requirements Resolution ===\n");

  const sState = calculateMockState(mockProducts["prod_samsung"]);
  console.log("Samsung Physical:");
  console.log("Missing fields:");
  sState.missingFields.forEach((f: string) => console.log(f));

  const aState = calculateMockState(mockProducts["prod_adobe"]);
  console.log("\nAdobe Digital (Email):");
  console.log("Missing fields:");
  aState.missingFields.forEach((f: string) => console.log(f));

  const dState = calculateMockState(mockProducts["prod_dm_code"]);
  console.log("\nDigital DM Code:");
  console.log("Missing fields:");
  dState.missingFields.forEach((f: string) => console.log(f));
}

testRequirements().catch(console.error);
