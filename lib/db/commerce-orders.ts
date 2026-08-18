import clientPromise from "@/lib/mongodb";
import { ObjectId } from 'mongodb';

export type OrderState = 
  | 'ORDER_REQUESTED'
  | 'INFORMATION_REQUIRED'
  | 'READY_FOR_SOURCING_CHECK'
  | 'PRODUCT_LINKAGE_REQUIRED'
  | 'PRODUCT_MATCH_REVIEW_REQUIRED'
  | 'VARIANT_UNAVAILABLE'
  | 'VARIANT_VERIFICATION_REQUIRED'
  | 'DESTINATION_UNAVAILABLE'
  | 'DESTINATION_VERIFICATION_REQUIRED'
  | 'OUT_OF_STOCK'
  | 'ORDER_NOT_AVAILABLE'
  | 'AVAILABILITY_UNKNOWN'
  | 'PRICE_REVIEW_REQUIRED'
  | 'PRICE_CHANGE_CUSTOMER_APPROVAL_REQUIRED'
  | 'LIVE_WEB_CHECK_PASSED'
  | 'READY_FOR_PAYMENT'
  | 'PAYMENT_PENDING'
  | 'PAID'
  | 'SOURCING'
  | 'AWAITING_HUMAN_APPROVAL'
  | 'SUPPLIER_PURCHASED'
  | 'AMAZON_VERIFICATION_RETRY_REQUIRED'
  | 'FX_VERIFICATION_REQUIRED'
  | 'DIGITAL_FULFILLMENT_PENDING'
  | 'DIGITAL_FULFILLMENT_FAILED'
  | 'FULFILLED'
  | 'SHIPPED';

// Sourcing events are audit trail entries, not order states.
// They track transient events like price checks and notifications.
export interface SourcingEvent {
  event: string;  // e.g. 'SUPPLIER_CHECK_STARTED', 'SUPPLIER_PRICE_CHANGED_MARGIN_OK', 'ADMIN_NOTIFIED'
  timestamp: Date;
  details?: Record<string, any>;
}

export interface ShippingAddress {
  recipientName?: string;
  line1?: string;
  line2?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  country?: string;
}

export interface LocationContext {
  rawAddress: string;
  normalizedAddress?: string;
  countryCode?: string;
  countryName?: string;
  callingCode?: string;
  administrativeArea?: string;
  locality?: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
  placeId?: string;
  confidence: "high" | "medium" | "low";
  validationStatus: "verified" | "partially_verified" | "needs_clarification" | "unverified";
  validationProvider?: "google_geocoding" | "google_address_validation" | "combined";
}

export interface PhoneContext {
  rawPhone: string;
  normalizedPhone?: string;
  countryCode?: string;
  callingCode?: string;
  isPossible?: boolean;
  isValid?: boolean;
  resolution: "missing" | "needs_clarification" | "inferred" | "confirmed" | "invalid" | "country_conflict";
}

export type CustomerIntent =
  | 'buying'
  | 'considering'
  | 'hesitating'
  | 'asking_question'
  | 'price_concern'
  | 'comparison'
  | 'cancel_intent'
  | 'confirmed';

export type FieldResolution = 
  | 'missing'
  | 'provided'
  | 'needs_clarification'
  | 'confirmed'
  | 'invalid';

export interface OrderFieldResolution {
  field: string;
  resolution: FieldResolution;
  reason?: string;
  rawValue?: any;
  normalizedValue?: any;
  inferredCountry?: string;
}

export interface ConversationRequestRecord {
  field?: string;
  action: string;
  valueReceived?: string;
  outcome?: string;
  timestamp: string;
}

export interface OrderCollectedFields {
  quantity?: number;
  size?: string;
  color?: string;
  phone?: string;
  shippingAddress?: ShippingAddress;
  variant?: string;
  email?: string;
}

export interface CommerceOrder {
  _id?: ObjectId;
  customer_igsid: string; // Instagram sender ID
  native_message_id: string; // the MID of the order request template
  displayed_product_title: string; // e.g. "Next"
  displayed_price?: string; // e.g. "US$ 0.00"
  
  commerceProductId?: string; // Internal catalog ID once matched
  supplierOfferId?: string; // Internal supplier offer ID once matched
  
  status: OrderState;
  
  productCategory?: string;
  requiredFields?: string[];
  missingFields?: string[];
  fieldResolutions?: Record<string, OrderFieldResolution>;
  
  // Information collected by Sonia
  collected_info: OrderCollectedFields;
  customerIntent?: CustomerIntent;
  recentRequests?: ConversationRequestRecord[];
  
  // Normalized Location
  locationContext?: LocationContext;
  
  // Sourcing audit trail (transient events, not order states)
  sourcingEvents?: SourcingEvent[];
  
  // Repricing context
  proposedNewPrice?: number;  // Set when PRICE_CHANGE_CUSTOMER_APPROVAL_REQUIRED
  originalCustomerPrice?: number;
  proposedCurrency?: string;
  proposedAt?: Date;
  repricingVersion?: number;
  
  // Sourcing Job Lock
  sourcingStartedAt?: Date;
  sourcingAttemptId?: string;
  
  // Future linkage
  checkoutUrl?: string; // Stripe or PayTabs session URL
  meta_commerce_order_id?: string;
  supplier_order_id?: string;
  
  created_at: Date;
  updated_at: Date;
}

export async function createCommerceOrder(order: Omit<CommerceOrder, '_id' | 'created_at' | 'updated_at'>): Promise<ObjectId> {
  const client = await clientPromise;
  const db = client.db("dxbmovies");
  const collection = db.collection<CommerceOrder>('commerce_orders');
  
  const now = new Date();
  const result = await collection.insertOne({
    ...order,
    created_at: now,
    updated_at: now
  });
  
  return result.insertedId;
}

export async function getCommerceOrder(orderId: string): Promise<CommerceOrder | null> {
  const client = await clientPromise;
  const db = client.db("dxbmovies");
  const collection = db.collection<CommerceOrder>('commerce_orders');
  
  return await collection.findOne({ _id: new ObjectId(orderId) });
}

export async function getActiveOrderForCustomer(igsid: string): Promise<CommerceOrder | null> {
  const client = await clientPromise;
  const db = client.db("dxbmovies");
  const collection = db.collection<CommerceOrder>('commerce_orders');
  
  // Find the most recent active order
  const order = await collection.findOne({
    customer_igsid: igsid,
    status: { $in: [
      'ORDER_REQUESTED', 
      'INFORMATION_REQUIRED', 
      'READY_FOR_SOURCING_CHECK',
      'PRODUCT_LINKAGE_REQUIRED',
      'PRODUCT_MATCH_REVIEW_REQUIRED',
      'LIVE_WEB_CHECK_PASSED',
      'PRICE_REVIEW_REQUIRED',
      'PRICE_CHANGE_CUSTOMER_APPROVAL_REQUIRED',
      'READY_FOR_PAYMENT', 
      'PAYMENT_PENDING', 
      'PAID', 
      'SOURCING', 
      'AWAITING_HUMAN_APPROVAL', 
      'SUPPLIER_PURCHASED'
    ] }
  }, { sort: { created_at: -1 } });

  if (!order) return null;

  // State-aware expiry:
  // ORDER_REQUESTED and INFORMATION_REQUIRED expire after 24 hours of inactivity.
  if (order.status === 'ORDER_REQUESTED' || order.status === 'INFORMATION_REQUIRED') {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    if (order.updated_at < twentyFourHoursAgo) {
      return null; // Expired, so we pretend there's no active order.
    }
  }

  // Other operational states do not expire implicitly.
  return order;
}

export async function updateOrderCollectedInfo(orderId: string, info: Partial<CommerceOrder['collected_info']>): Promise<void> {
  const client = await clientPromise;
  const db = client.db("dxbmovies");
  const collection = db.collection<CommerceOrder>('commerce_orders');
  
  // Create update object with dot notation for nested fields
  const updateDoc: Record<string, any> = { updated_at: new Date() };
  for (const [key, value] of Object.entries(info)) {
    updateDoc[`collected_info.${key}`] = value;
  }

  await collection.updateOne(
    { _id: new ObjectId(orderId) },
    { $set: updateDoc }
  );
}

export async function updateOrderStatus(orderId: string, status: OrderState): Promise<void> {
  const client = await clientPromise;
  const db = client.db("dxbmovies");
  const collection = db.collection<CommerceOrder>('commerce_orders');
  
  await collection.updateOne(
    { _id: new ObjectId(orderId) },
    { 
      $set: { 
        status,
        updated_at: new Date() 
      } 
    }
  );
}

export async function appendConversationRequest(orderId: string, record: ConversationRequestRecord): Promise<void> {
  const client = await clientPromise;
  const db = client.db("dxbmovies");
  const collection = db.collection<CommerceOrder>('commerce_orders');
  
  await collection.updateOne(
    { _id: new ObjectId(orderId) },
    { 
      $push: { 
        recentRequests: {
          $each: [record],
          $slice: -10 // Keep only the last 10 requests
        }
      } as any,
      $set: { updated_at: new Date() } 
    }
  );
}

// Order Orchestrator rule engine - called whenever an order is created or updated
export async function runOrderOrchestrator(orderId: string | ObjectId): Promise<void> {
  const { calculateOrderState } = await import('@/lib/commerce/orchestrator');
  
  const client = await clientPromise;
  const db = client.db("dxbmovies");
  const collection = db.collection<CommerceOrder>('commerce_orders');
  const order = await collection.findOne({ _id: new ObjectId(orderId) });
  
  if (!order) return;

  const { status: nextStatus, missingFields, requiredFields, productCategory, fieldResolutions } = await calculateOrderState(order);

  const updates: any = {};
  let hasChanges = false;

  if (nextStatus !== order.status) {
    updates.status = nextStatus;
    hasChanges = true;
  }
  
  // Update category and fields if they changed or were initialized
  if (productCategory && productCategory !== order.productCategory) {
    updates.productCategory = productCategory;
    hasChanges = true;
  }
  
  if (JSON.stringify(requiredFields) !== JSON.stringify(order.requiredFields)) {
    updates.requiredFields = requiredFields;
    hasChanges = true;
  }

  if (JSON.stringify(missingFields) !== JSON.stringify(order.missingFields)) {
    updates.missingFields = missingFields;
    hasChanges = true;
  }

  if (JSON.stringify(fieldResolutions) !== JSON.stringify(order.fieldResolutions)) {
    updates.fieldResolutions = fieldResolutions;
    hasChanges = true;
  }

  if (hasChanges) {
    updates.updated_at = new Date();
    await collection.updateOne(
      { _id: new ObjectId(orderId) },
      { $set: updates }
    );
  }

  // Trigger sourcing engine deterministically if we just transitioned into READY_FOR_SOURCING_CHECK
  if (nextStatus === 'READY_FOR_SOURCING_CHECK' && order.status !== 'READY_FOR_SOURCING_CHECK') {
    const updatedOrder = await collection.findOne({ _id: new ObjectId(orderId) });
    if (updatedOrder) {
      console.log(`[orchestrator] Order ${orderId} transitioned to READY_FOR_SOURCING_CHECK. Sending Phase 1 Notification...`);
      
      console.log(`[orchestrator] Order ${orderId} transitioned to READY_FOR_SOURCING_CHECK. Triggering sourcing engine...`);

      console.log(`[orchestrator] Triggering sourcing job for ${orderId}...`);
      
      const { getCommerceProduct } = await import("@/lib/db/commerce-products");
      let isDigital = false;
      if (updatedOrder.commerceProductId) {
        const product = await getCommerceProduct(updatedOrder.commerceProductId);
        if (product && product.fulfillmentType === "digital") {
          isDigital = true;
          import("@/lib/commerce/digital-eligibility").then(({ checkDigitalEligibility }) => {
            checkDigitalEligibility(updatedOrder, product).catch(err => {
              console.error(`[orchestrator] Digital eligibility error for order ${orderId}:`, err);
            });
          });
        }
      }

      if (!isDigital) {
        import("@/lib/commerce/sourcing-engine").then(({ executeSourcingCheck }) => {
          executeSourcingCheck(updatedOrder).catch(err => {
            console.error(`[orchestrator] Sourcing engine error for order ${orderId}:`, err);
          });
        });
      }
    }
  }
}

export async function appendSourcingEvent(orderId: string, event: string, details?: Record<string, any>): Promise<void> {
  const client = await clientPromise;
  const db = client.db("dxbmovies");
  const collection = db.collection<CommerceOrder>('commerce_orders');
  
  await collection.updateOne(
    { _id: new ObjectId(orderId) },
    { 
      $push: { sourcingEvents: { event, timestamp: new Date(), details } } as any,
      $set: { updated_at: new Date() }
    }
  );
}

export async function updateOrderRepricing(
  orderId: string, 
  proposedNewPrice: number, 
  originalCustomerPrice: number,
  proposedCurrency: string,
  repricingVersion: number = 1
): Promise<void> {
  const client = await clientPromise;
  const db = client.db("dxbmovies");
  const collection = db.collection<CommerceOrder>('commerce_orders');

  await collection.updateOne(
    { _id: new ObjectId(orderId) },
    { 
      $set: { 
        status: 'PRICE_CHANGE_CUSTOMER_APPROVAL_REQUIRED' as OrderState,
        proposedNewPrice,
        originalCustomerPrice,
        proposedCurrency,
        proposedAt: new Date(),
        repricingVersion,
        updated_at: new Date() 
      } 
    }
  );
}

import { randomUUID } from "crypto";

export async function claimOrderForSourcing(orderId: string): Promise<CommerceOrder | null> {
  const client = await clientPromise;
  const db = client.db("dxbmovies");
  const collection = db.collection<CommerceOrder>('commerce_orders');

  const attemptId = randomUUID();
  const now = new Date();

  // Atomically claim the order: it must be READY_FOR_SOURCING_CHECK and not already claimed
  const result = await collection.findOneAndUpdate(
    { 
      _id: new ObjectId(orderId), 
      status: 'READY_FOR_SOURCING_CHECK',
      sourcingStartedAt: { $exists: false }
    },
    { 
      $set: { 
        sourcingStartedAt: now,
        sourcingAttemptId: attemptId,
        updated_at: now
      },
      // Optionally increment a sourcing version if you wanted multiple attempts later
      $inc: { sourcingVersion: 1 } as any
    },
    { returnDocument: 'after' }
  );

  return result ? (result as any) : null;
}
