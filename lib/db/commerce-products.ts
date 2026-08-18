import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";

// --------------- Pricing Policy ---------------

export interface PricingPolicy {
  markupPercent: number;               // e.g. 30 → newPrice = cost × 1.30
  minimumGrossMarginPercent?: number;  // e.g. 20 → margin floor check
  allowAutomaticReprice?: boolean;     // If true, auto-reprice when economics break
}

export const DEFAULT_PRICING_POLICY: PricingPolicy = {
  markupPercent: 30,
  minimumGrossMarginPercent: 20,
  allowAutomaticReprice: true,
};

// --------------- Purchase Requirements ---------------

export interface PurchaseRequirements {
  /** Fields the customer must provide (e.g. ["quantity", "shippingAddress", "phone"]) */
  requiredFields: string[];
  /** Attributes already fixed by the product listing (e.g. { screenSize: '34"' }) */
  fixedAttributes?: Record<string, string>;
  /** Attributes the customer must choose from (e.g. { color: ["Black", "Silver"] }) */
  selectableAttributes?: Record<string, string[]>;
}

export type CommerceProductStatus = "draft" | "active" | "hidden" | "archived";
export type SupplierOfferStatus = "active" | "unavailable" | "stale" | "rejected";

export type MovieRelationshipType = "worn_by_character" | "seen_in_scene" | "similar_style" | "general_recommendation";

export interface MovieRelationship {
  movieId?: string;
  tmdbId?: string;
  relationshipType: MovieRelationshipType;
  confidence: number;
  sceneContext?: string;
}

export type FulfillmentType = "physical" | "digital" | "service";

export interface CommerceProduct {
  _id?: ObjectId | string;
  fulfillmentType?: FulfillmentType;
  instagramProductId?: string;
  instagramMediaId?: string;
  instagramProductTitle: string;
  instagramSellingPrice: number;
  currency: string;
  preferredSupplierOfferId?: string;
  
  orderingEnabled?: boolean;
  customerVisible?: boolean;
  
  // Intelligent order requirements
  purchaseRequirements?: PurchaseRequirements;
  pricingPolicy?: PricingPolicy;
  
  // Digital fulfillment properties
  resaleAuthorized?: boolean;
  fulfillmentMethod?: string;
  
  // Legacy / other fields preserved for app use
  id: string; // Friendly ID
  title?: string;
  description: string;
  category: string;
  images: string[];
  movieRelationship?: MovieRelationship;
  status: CommerceProductStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface SupplierOffer {
  _id?: ObjectId | string;
  commerceProductId: string;
  
  supplier: string; // e.g., "amazon"
  marketplace: string; // e.g., "www.amazon.com", "www.amazon.ae"
  partnerTag?: string; // Amazon Associates Partner Tag
  
  supplierProductTitle: string;
  supplierProductUrl?: string;
  canonicalSupplierUrl?: string; // Resolved exact URL for sourcing checks
  supplierProductId?: string; // ASIN or SKU
  
  supplierPriceAtListing: number;
  currency: string;
  
  supportedVariants?: {
    sizes?: string[];
    colors?: string[];
  };
  
  destinationAvailability?: string[];
  
  lastVerifiedAt?: Date;
  status: SupplierOfferStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface DigitalSupplierOffer {
  _id?: ObjectId | string;
  commerceProductId: string;
  
  supplier: string;
  supplierProductId?: string;
  supplierUrl?: string;
  
  wholesaleCost: number;
  currency: string;
  
  fulfillmentMethod: 'download_url' | 'license_key' | 'account_access' | 'API_delivery' | 'manual_delivery';
  resaleAuthorized: boolean;
  
  status: SupplierOfferStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface SupplierCheckResult {
  offerId: string;
  matched: boolean;
  matchConfidence: number;
  requestedVariantAvailable: boolean;
  livePrice: number;
  currency: string;
  destinationSupported: boolean;
  checkedAt: Date;
}

// ---------------- Commerce Products ----------------

async function getCommerceProductsCollection() {
  const client = await clientPromise;
  const db = client.db("dxbmovies");
  return db.collection<CommerceProduct>("commerce_products");
}

export async function getCommerceProduct(id: string): Promise<CommerceProduct | null> {
  const col = await getCommerceProductsCollection();
  return col.findOne({ id });
}

export async function getCommerceProductByExactTitle(title: string): Promise<CommerceProduct | null> {
  const col = await getCommerceProductsCollection();
  // Normalize whitespace, punctuation, and casing
  const normalizedTitle = title.trim().replace(/\s+/g, " ");
  
  // Create an exact match lookup (case insensitive for safety, but functionally exact on the string)
  // This avoids fuzzy matching other products.
  return col.findOne({ 
    instagramProductTitle: { $regex: `^${escapeRegex(normalizedTitle)}$`, $options: "i" } 
  });
}

function escapeRegex(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function searchCommerceProducts(
  query: string,
  maxPrice?: number,
  category?: string,
  opts?: { customerFacing?: boolean }
): Promise<CommerceProduct[]> {
  const col = await getCommerceProductsCollection();
  
  // Use regex for Admin search instead of $text to avoid index requirements
  const filter: any = { status: "active" };

  // Customer-facing lookups must only ever surface products an admin has explicitly
  // switched on. Fail closed: a product without orderingEnabled is NOT for sale.
  // Admin searches (the default) still see everything.
  if (opts?.customerFacing) {
    filter.orderingEnabled = true;
    filter.customerVisible = { $ne: false };
  }
  
  if (query) {
    filter.instagramProductTitle = { $regex: escapeRegex(query), $options: "i" };
  }
  if (category) {
    filter.category = category;
  }
  
  // maxPrice requires joining SupplierOffers. 
  // For the MVP interface, we'll return products and Sonia will check offers.
  // Or we do an aggregation. To keep it simple, we just return products here.
  return col.find(filter).limit(10).toArray();
}

export async function upsertCommerceProduct(productData: Partial<CommerceProduct> & { id?: string }): Promise<CommerceProduct> {
  const col = await getCommerceProductsCollection();
  const now = new Date();
  
  const { id, ...rest } = productData;
  const targetId = id || new ObjectId().toString();
  
  const updateDoc = {
    ...rest,
    updatedAt: now,
  };
  
  await col.updateOne(
    { id: targetId },
    { 
      $set: updateDoc,
      $setOnInsert: { id: targetId, createdAt: now } 
    },
    { upsert: true }
  );
  
  return (await getCommerceProduct(targetId))!;
}

export async function deleteCommerceProduct(productId: string): Promise<boolean> {
  const productCol = await getCommerceProductsCollection();
  const offersCol = await getSupplierOffersCollection();
  
  await offersCol.deleteMany({ commerceProductId: productId });
  const result = await productCol.deleteOne({ id: productId });
  
  return result.deletedCount > 0;
}

// ---------------- Supplier Offers ----------------

async function getSupplierOffersCollection() {
  const client = await clientPromise;
  const db = client.db("dxbmovies");
  return db.collection<SupplierOffer>("supplier_offers");
}

export async function getSupplierOffersForProduct(commerceProductId: string): Promise<SupplierOffer[]> {
  const col = await getSupplierOffersCollection();
  return col.find({ commerceProductId, status: "active" }).toArray();
}

export function validateProductForActivation(product: CommerceProduct, offers: (SupplierOffer | DigitalSupplierOffer)[]) {
  if (!product.instagramProductTitle) throw new Error("Missing instagramProductTitle");
  if (!product.instagramSellingPrice) throw new Error("Missing instagramSellingPrice");
  if (!product.currency) throw new Error("Missing currency");
  
  if (!offers || offers.length === 0) {
    throw new Error("Product must have at least one supplier offer before activation.");
  }
  
  // Removed strict fulfillmentMethod/marketplace checks to allow dropshipping
  // digital products via Amazon links.
  const validOffer = offers.find(o => o.supplier);
  
  if (!validOffer) {
    throw new Error("Product must have a valid supplier offer with a supplier name.");
  }
  
  return true;
}

export async function upsertSupplierOffer(offerData: Partial<SupplierOffer> & { commerceProductId: string, supplierName: string, supplierProductId?: string, supplierProductTitle: string }): Promise<SupplierOffer> {
  const col = await getSupplierOffersCollection();
  const now = new Date();
  
  const { supplierName, ...rest } = offerData;
  
  const updateDoc = {
    ...rest,
    supplier: supplierName,
    updatedAt: now,
  };

  const result = await col.findOneAndUpdate(
    { 
      commerceProductId: offerData.commerceProductId,
      supplier: offerData.supplierName,
      supplierProductId: offerData.supplierProductId
    },
    { 
      $set: updateDoc,
      $setOnInsert: { createdAt: now } 
    },
    { upsert: true, returnDocument: "after" }
  );

  return (result?.value || result) as unknown as SupplierOffer;
}
