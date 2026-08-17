import { CommerceOrder, OrderState, OrderFieldResolution, FieldResolution } from "@/lib/db/commerce-orders";
import { getCommerceProduct, PurchaseRequirements, CommerceProduct } from "@/lib/db/commerce-products";

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

export function resolveProductRequirements(
  product: Pick<CommerceProduct, 'category' | 'fulfillmentType' | 'purchaseRequirements'> | null,
  fallbackCategory: string
): { requiredFields: string[], fixedAttributes?: Record<string, string>, selectableAttributes?: Record<string, string[]>, category: string } {
  if (!product) {
    const requiredFields = CATEGORY_REQUIREMENTS[fallbackCategory] || CATEGORY_REQUIREMENTS["generic"];
    return { requiredFields, category: fallbackCategory };
  }

  const category = product.category || fallbackCategory;
  let fields: string[] = [];
  const fulfillmentType = product.fulfillmentType || "physical";
  
  if (product.purchaseRequirements && product.purchaseRequirements.requiredFields) {
    fields = [...product.purchaseRequirements.requiredFields];
  } else {
    if (fulfillmentType === "physical") {
      const categoryFields = CATEGORY_REQUIREMENTS[category] || CATEGORY_REQUIREMENTS["generic"];
      fields = [...categoryFields];
    } else if (fulfillmentType === "digital") {
      fields = ["quantity"];
    } else if (fulfillmentType === "service") {
      fields = ["customerName"];
    }
  }

  const selectableAttributes = product.purchaseRequirements?.selectableAttributes;
  if (selectableAttributes) {
    for (const attrName of Object.keys(selectableAttributes)) {
      if (!fields.includes(attrName)) {
        fields.push(attrName);
      }
    }
  }
  
  return {
    requiredFields: fields,
    fixedAttributes: product.purchaseRequirements?.fixedAttributes,
    selectableAttributes: selectableAttributes,
    category,
  };
}

export async function resolveRequirements(order: CommerceOrder): Promise<{
  requiredFields: string[];
  fixedAttributes?: Record<string, string>;
  selectableAttributes?: Record<string, string[]>;
  category: string;
}> {
  let category = order.productCategory || detectCategory(order.displayed_product_title);
  
  let product = null;
  if (order.commerceProductId) {
    product = await getCommerceProduct(order.commerceProductId);
  }
  
  return resolveProductRequirements(product, category);
}

// --------------- Field Validation ---------------

function detectCountryFromAddress(address: any): { code: string; dialCode: string } | null {
  if (!address) return null;
  const str = JSON.stringify(address).toLowerCase();
  if (str.includes("uae") || str.includes("united arab emirates") || str.includes("dubai") || str.includes("abu dhabi")) {
    return { code: "AE", dialCode: "+971" };
  }
  if (str.includes("saudi") || str.includes("ksa") || str.includes("riyadh")) {
    return { code: "SA", dialCode: "+966" };
  }
  if (str.includes("uk ") || str.includes("united kingdom") || str.includes("london")) {
    return { code: "GB", dialCode: "+44" };
  }
  if (str.includes("us ") || str.includes("usa") || str.includes("united states") || str.includes("new york")) {
    return { code: "US", dialCode: "+1" };
  }
  return null;
}

import { resolveLocation, parsePhone } from './location';

export async function validateFieldAsync(field: string, value: any, context?: any, order?: CommerceOrder): Promise<{ valid: boolean; resolution: FieldResolution; reason?: string; rawValue?: any; normalizedValue?: any; inferredCountry?: string }> {
  if (value === undefined || value === null || value === "") {
    return { valid: false, resolution: "missing", reason: "missing" };
  }

  switch (field) {
    case "quantity":
      // Strict: must be an actual number (not a string like "yes" or "sure")
      if (typeof value === "string") {
        const parsed = parseInt(value, 10);
        if (isNaN(parsed) || parsed <= 0 || parsed.toString() !== value.trim()) {
          return { valid: false, resolution: "invalid", reason: "quantity_must_be_positive_integer", rawValue: value };
        }
        // String that parses to a valid int is acceptable (AI might send "2")
        return { valid: true, resolution: "provided", rawValue: value, normalizedValue: parsed };
      }
      if (typeof value !== "number" || value <= 0 || !Number.isInteger(value)) {
        return { valid: false, resolution: "invalid", reason: "quantity_must_be_positive_integer", rawValue: value };
      }
      return { valid: true, resolution: "provided", rawValue: value, normalizedValue: value };

    case "phone":
      if (typeof value !== "string" && typeof value !== "number") {
        return { valid: false, resolution: "invalid", reason: "invalid_type", rawValue: value };
      }
      const phoneCtx = parsePhone(String(value), order?.locationContext || (order?.collected_info?.shippingAddress as any));
      
      if (phoneCtx.resolution === "needs_clarification" || phoneCtx.resolution === "inferred") {
        if (order?.fieldResolutions?.["phone"]?.resolution === "needs_clarification" && 
            order?.fieldResolutions?.["phone"]?.normalizedValue === phoneCtx.normalizedPhone) {
          return { valid: true, resolution: "provided", rawValue: value, normalizedValue: phoneCtx.normalizedPhone };
        }
        return {
          valid: false,
          resolution: "needs_clarification",
          reason: "confirm_inferred_international_number",
          rawValue: value,
          normalizedValue: phoneCtx.normalizedPhone,
          inferredCountry: phoneCtx.countryCode
        };
      } else if (phoneCtx.resolution === "country_conflict") {
        if (order?.fieldResolutions?.["phone"]?.resolution === "needs_clarification" && 
            order?.fieldResolutions?.["phone"]?.normalizedValue === phoneCtx.normalizedPhone) {
          return { valid: true, resolution: "provided", rawValue: value, normalizedValue: phoneCtx.normalizedPhone };
        }
        return {
          valid: false,
          resolution: "needs_clarification",
          reason: "country_conflict",
          rawValue: value,
          normalizedValue: phoneCtx.normalizedPhone,
          inferredCountry: phoneCtx.countryCode
        };
      } else if (phoneCtx.resolution === "invalid") {
        return { valid: false, resolution: "invalid", reason: "invalid_phone", rawValue: value };
      } else if (phoneCtx.resolution === "confirmed") {
        return { valid: true, resolution: "provided", rawValue: value, normalizedValue: phoneCtx.normalizedPhone };
      }
      return { valid: false, resolution: "invalid", reason: "unknown", rawValue: value };

    case "shippingAddress":
      const locCtx = await resolveLocation(value);
      
      // If we are calling validateFieldAsync just to check validity (not save), we shouldn't mutate order directly here.
      // But we can return the LocationContext as normalizedValue so the caller can save it.
      
      if (locCtx.validationStatus === "needs_clarification") {
         return { valid: false, resolution: "needs_clarification", reason: "incomplete_address_details", rawValue: value, normalizedValue: locCtx };
      } else if (locCtx.validationStatus === "unverified") {
         return { valid: false, resolution: "invalid", reason: "invalid_address", rawValue: value, normalizedValue: locCtx };
      }
      
      return { valid: true, resolution: "provided", rawValue: value, normalizedValue: locCtx };

    case "size":
    case "color":
    case "variant":
    case "storage":
      if (typeof value === "number") {
        value = value.toString();
      }
      if (typeof value !== "string" || value.trim().length === 0) {
        return { valid: false, resolution: "invalid", reason: "empty_string", rawValue: value };
      }
      return { valid: true, resolution: "provided", rawValue: value, normalizedValue: value };

    default:
      // For any dynamic selectable attribute
      if (typeof value === "string" && value.trim().length > 0) return { valid: true, resolution: "provided", rawValue: value, normalizedValue: value };
      if (typeof value === "number") return { valid: true, resolution: "provided", rawValue: value, normalizedValue: value };
      return { valid: false, resolution: "invalid", reason: "empty_or_invalid", rawValue: value };
  }
}

// --------------- Main State Calculation ---------------

export async function calculateOrderState(order: CommerceOrder) {
  const { requiredFields, fixedAttributes, selectableAttributes, category } = await resolveRequirements(order);

  const collected = order.collected_info || {} as any;
  const missingFields: string[] = [];
  const fieldResolutions: Record<string, OrderFieldResolution> = {};

  for (const field of requiredFields) {
    // Skip fields that are already fixed by the product
    if (fixedAttributes && field in fixedAttributes) {
      fieldResolutions[field] = { field, resolution: "provided", rawValue: fixedAttributes[field], normalizedValue: fixedAttributes[field] };
      continue;
    }
    
    const value = (collected as any)[field];
    const validation = await validateFieldAsync(field, value, collected, order);
    
    // Check if customer explicitly confirmed it
    let finalResolution = validation.resolution;
    let finalValue = validation.normalizedValue || validation.rawValue;
    
    // If the field is in collected_info and we had a recent request that resulted in confirmed
    // We assume it's valid now if it's already normalized, but actually validateField should handle it.
    
    fieldResolutions[field] = {
      field,
      resolution: validation.resolution,
      reason: validation.reason,
      rawValue: validation.rawValue,
      normalizedValue: validation.normalizedValue,
      inferredCountry: validation.inferredCountry
    };

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
    fieldResolutions,
    status
  };
}
