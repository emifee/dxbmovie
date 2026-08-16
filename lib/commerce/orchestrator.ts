import { CommerceOrder, OrderState } from "@/lib/db/commerce-orders";
import { getCommerceProduct, PurchaseRequirements } from "@/lib/db/commerce-products";

// --------------- Fallback Category Requirements ---------------
// Used only when a product has no explicit purchaseRequirements.

export const CATEGORY_REQUIREMENTS: Record<string, string[]> = {
  dvd: [
    "quantity",
    "shippingAddress",
    "phone"
  ],
  shoes: [
    "size",
    "color",
    "quantity",
    "shippingAddress",
    "phone"
  ],
  clothing: [
    "size",
    "color",
    "quantity",
    "shippingAddress",
    "phone"
  ],
  electronics: [
    "quantity",
    "shippingAddress",
    "phone"
  ],
  generic: [
    "quantity",
    "shippingAddress",
    "phone"
  ]
};

// Simple deterministic category detection based on title keywords.
export function detectCategory(title: string): string {
  const lower = title.toLowerCase();
  
  if (lower.includes("dvd") || lower.includes("book") || lower.includes("poster")) {
    return "dvd";
  }
  
  if (lower.includes("shoe") || lower.includes("sneaker") || lower.includes("boot") || lower.includes("air max") || lower.includes("yeezy")) {
    return "shoes";
  }

  if (lower.includes("shirt") || lower.includes("hoodie") || lower.includes("jacket") || lower.includes("clothing")) {
    return "clothing";
  }

  if (lower.includes("phone") || lower.includes("laptop") || lower.includes("electronics") || lower.includes("iphone") || lower.includes("samsung") || lower.includes("tv") || lower.includes("monitor")) {
    return "electronics";
  }

  return "generic";
}

// --------------- Requirement Resolution ---------------
// Priority: product.purchaseRequirements > product.selectableAttributes > category fallback

export async function resolveRequirements(order: CommerceOrder): Promise<{
  requiredFields: string[];
  fixedAttributes?: Record<string, string>;
  selectableAttributes?: Record<string, string[]>;
  category: string;
}> {
  let category = order.productCategory || detectCategory(order.displayed_product_title);
  
  // Try to load product-level requirements
  if (order.commerceProductId) {
    const product = await getCommerceProduct(order.commerceProductId);
    if (product?.purchaseRequirements) {
      const pr = product.purchaseRequirements;
      
      // Build the required fields list:
      // Start with explicit requiredFields, then add selectable attributes as required fields
      let fields = [...pr.requiredFields];
      
      if (pr.selectableAttributes) {
        for (const attrName of Object.keys(pr.selectableAttributes)) {
          if (!fields.includes(attrName)) {
            fields.push(attrName);
          }
        }
      }
      
      return {
        requiredFields: fields,
        fixedAttributes: pr.fixedAttributes,
        selectableAttributes: pr.selectableAttributes,
        category: product.category || category,
      };
    }
    
    if (product?.category) {
      category = product.category;
    }
  }
  
  // Fallback to category-based requirements
  const requiredFields = CATEGORY_REQUIREMENTS[category] || CATEGORY_REQUIREMENTS["generic"];
  return { requiredFields, category };
}

// --------------- Field Validation ---------------

export function validateField(field: string, value: any): { valid: boolean; reason?: string } {
  if (value === undefined || value === null) return { valid: false, reason: "missing" };

  switch (field) {
    case "quantity":
      // Strict: must be an actual number (not a string like "yes" or "sure")
      if (typeof value === "string") {
        const parsed = parseInt(value, 10);
        if (isNaN(parsed) || parsed <= 0 || parsed.toString() !== value.trim()) {
          return { valid: false, reason: "quantity_must_be_positive_integer" };
        }
        // String that parses to a valid int is acceptable (AI might send "2")
        return { valid: true };
      }
      if (typeof value !== "number" || value <= 0 || !Number.isInteger(value)) {
        return { valid: false, reason: "quantity_must_be_positive_integer" };
      }
      return { valid: true };

    case "phone":
      if (typeof value !== "string") {
        return { valid: false, reason: "invalid_type" };
      }
      const stripped = value.replace(/[\s\-()]/g, "");
      if (!stripped.startsWith("+") || stripped.length < 8) {
        return { valid: false, reason: "phone_missing_country_code" };
      }
      return { valid: true };

    case "shippingAddress":
      if (typeof value !== "object" || !value) {
        return { valid: false, reason: "invalid_address_object" };
      }
      if (!value.line1 || !value.city) {
        return { valid: false, reason: "incomplete_address_details" };
      }
      return { valid: true };

    case "size":
    case "color":
    case "variant":
    case "storage":
      if (typeof value === "number") {
        value = value.toString();
      }
      if (typeof value !== "string" || value.trim().length === 0) {
        return { valid: false, reason: "empty_string" };
      }
      return { valid: true };

    default:
      // For any dynamic selectable attribute
      if (typeof value === "string" && value.trim().length > 0) return { valid: true };
      if (typeof value === "number") return { valid: true };
      return { valid: false, reason: "empty_or_invalid" };
  }
}

// --------------- Main State Calculation ---------------

export async function calculateOrderState(order: CommerceOrder) {
  const { requiredFields, fixedAttributes, selectableAttributes, category } = await resolveRequirements(order);

  const collected = order.collected_info || {} as any;
  const missingFields: string[] = [];

  for (const field of requiredFields) {
    // Skip fields that are already fixed by the product
    if (fixedAttributes && field in fixedAttributes) {
      continue;
    }
    
    const value = (collected as any)[field];
    const validation = validateField(field, value);
    if (!validation.valid) {
      missingFields.push(field);
    }
  }

  let status = order.status;
  
  if (status === "ORDER_REQUESTED" || status === "INFORMATION_REQUIRED") {
    if (missingFields.length > 0) {
      status = "INFORMATION_REQUIRED";
    } else {
      status = "READY_FOR_SOURCING_CHECK";
    }
  }

  return {
    productCategory: category,
    requiredFields,
    missingFields,
    status
  };
}
