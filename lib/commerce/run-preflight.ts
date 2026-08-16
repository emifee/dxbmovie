import { CommerceOrder, runOrderOrchestrator } from "@/lib/db/commerce-orders";
import { getCommerceProduct, getSupplierOffersForProduct } from "@/lib/db/commerce-products";
import { insertSupplierCheck } from "@/lib/db/supplier-checks";
import { MockSupplierProvider } from "./providers/mock-supplier";
import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";

export async function executeSourcingPreflight(order: CommerceOrder) {
  try {
    let internalProductId = order.commerceProductId;

    // 1. Map to internal product if missing
    if (!internalProductId) {
      const { searchCommerceProducts } = await import("@/lib/db/commerce-products");
      const matchedProducts = await searchCommerceProducts(order.displayed_product_title);
      if (matchedProducts.length > 0) {
        internalProductId = matchedProducts[0].id;
        // Ideally we'd save this back to the order, but we proceed for now
      }
    }

    if (!internalProductId) {
      console.error(`[Preflight] Could not map displayed title '${order.displayed_product_title}' to an internal product.`);
      await updateOrderStatus(order._id!.toString(), "PRICE_REVIEW_REQUIRED");
      return;
    }

    const product = await getCommerceProduct(internalProductId);
    if (!product) {
      console.error(`[Preflight] Product ${internalProductId} not found in catalog.`);
      await updateOrderStatus(order._id!.toString(), "PRICE_REVIEW_REQUIRED");
      return;
    }

    // 2. Find the preferred supplier offer
    const offers = await getSupplierOffersForProduct(product.id);
    let targetOffer = offers.find(o => o._id?.toString() === product.preferredSupplierOfferId) 
                      || offers[0];

    if (!targetOffer) {
      console.error(`[Preflight] No supplier offer found for product ${product.id}.`);
      await updateOrderStatus(order._id!.toString(), "PRICE_REVIEW_REQUIRED");
      return;
    }

    // 3. Initialize the provider (using Mock for Step 3)
    const provider = new MockSupplierProvider();

    // 4. Extract requested variants from order
    const collected = order.collected_info || {};
    const requestedVariant = {
      size: collected.size,
      color: collected.color,
      quantity: collected.quantity || 1,
      shippingCountry: collected.shippingAddress?.country || "AE"
    };

    // 5. Check live availability
    console.log(`[Preflight] Running check via ${provider.name} for offer ${targetOffer._id}`);
    const checkResult = await provider.checkVariantAvailability(targetOffer, requestedVariant);

    // 6. Save the check result
    await insertSupplierCheck({
      ...checkResult,
      orderId: order._id!.toString(),
      commerceProductId: product.id
    });

    // 7. Make Margin & Availability Decision based on explicit logic

    // Product Match Check
    let passMatch = false;
    const matchedBy = checkResult.productMatch.matchedBy;
    const confidence = checkResult.productMatch.confidence;

    if (checkResult.productMatch.matched) {
      if (matchedBy === "supplier_product_id" || matchedBy === "exact_url") {
        passMatch = true;
      } else if (matchedBy === "exact_title" && confidence >= 0.95) {
        passMatch = true;
      } else if (matchedBy === "title_brand_model" && confidence >= 0.90) {
        passMatch = true;
      }
    }

    if (!passMatch) {
      console.log(`[Preflight] Product Match failed: MatchedBy=${matchedBy}, Confidence=${confidence}`);
      await updateOrderStatus(order._id!.toString(), "PRODUCT_MATCH_REVIEW_REQUIRED");
      return;
    }

    // Variant Checks
    if (checkResult.variant.sizeRequested) {
      if (checkResult.variant.sizeAvailable === false) {
        console.log(`[Preflight] Variant failed: Size unavailable`);
        await updateOrderStatus(order._id!.toString(), "VARIANT_UNAVAILABLE");
        return;
      } else if (checkResult.variant.sizeAvailable == null) {
        console.log(`[Preflight] Variant failed: Size verification required`);
        await updateOrderStatus(order._id!.toString(), "VARIANT_VERIFICATION_REQUIRED");
        return;
      }
    }
    
    if (checkResult.variant.colorRequested) {
      if (checkResult.variant.colorAvailable === false) {
        console.log(`[Preflight] Variant failed: Color unavailable`);
        await updateOrderStatus(order._id!.toString(), "VARIANT_UNAVAILABLE");
        return;
      } else if (checkResult.variant.colorAvailable == null) {
        console.log(`[Preflight] Variant failed: Color verification required`);
        await updateOrderStatus(order._id!.toString(), "VARIANT_VERIFICATION_REQUIRED");
        return;
      }
    }

    if (checkResult.variant.quantityAvailable === false) {
      console.log(`[Preflight] Variant failed: Quantity unavailable`);
      await updateOrderStatus(order._id!.toString(), "VARIANT_UNAVAILABLE");
      return;
    } else if (checkResult.variant.quantityAvailable == null) {
      console.log(`[Preflight] Variant failed: Quantity verification required`);
      await updateOrderStatus(order._id!.toString(), "VARIANT_VERIFICATION_REQUIRED");
      return;
    }

    // Destination Check
    if (checkResult.destination.supported === false) {
      console.log(`[Preflight] Destination failed: Unsupported country`);
      await updateOrderStatus(order._id!.toString(), "DESTINATION_UNAVAILABLE");
      return;
    } else if (checkResult.destination.supported == null) {
      console.log(`[Preflight] Destination failed: Verification required`);
      await updateOrderStatus(order._id!.toString(), "DESTINATION_VERIFICATION_REQUIRED");
      return;
    }

    // Stock Check
    if (checkResult.availability === "out_of_stock") {
      console.log(`[Preflight] Stock failed: out_of_stock`);
      await updateOrderStatus(order._id!.toString(), "OUT_OF_STOCK");
      return;
    } else if (checkResult.availability === "unknown") {
      console.log(`[Preflight] Stock failed: unknown`);
      await updateOrderStatus(order._id!.toString(), "AVAILABILITY_UNKNOWN");
      return;
    }

    // Margin Check
    const sellingPrice = product.instagramSellingPrice || 0;
    const cost = checkResult.pricing.estimatedLandedCost;
    if (cost >= sellingPrice && sellingPrice > 0) {
      console.log(`[Preflight] Margin check failed: Selling=${sellingPrice}, Cost=${cost}`);
      await updateOrderStatus(order._id!.toString(), "PRICE_REVIEW_REQUIRED");
      return;
    }

    // 8. If all good, transition to payment OR mock pass
    if (provider.isMock) {
      console.log(`[Preflight] Check passed (MOCK provider). Transitioning to PREFLIGHT_TEST_PASSED.`);
      await updateOrderStatus(order._id!.toString(), "PREFLIGHT_TEST_PASSED");
    } else {
      console.log(`[Preflight] Check passed (LIVE provider). Proceeding to payment.`);
      await updateOrderStatus(order._id!.toString(), "READY_FOR_PAYMENT");
    }

  } catch (error) {
    console.error(`[Preflight] Exception during preflight:`, error);
    await updateOrderStatus(order._id!.toString(), "PRICE_REVIEW_REQUIRED");
  }
}

async function updateOrderStatus(orderId: string, status: string) {
  const client = await clientPromise;
  const db = client.db("dxbmovies");
  await db.collection("commerce_orders").updateOne(
    { _id: new ObjectId(orderId) },
    { $set: { status, updated_at: new Date() } }
  );
}
