import { CommerceOrder, updateOrderStatus } from "../db/commerce-orders";
import { getCommerceProduct, DigitalSupplierOffer } from "../db/commerce-products";

export class DigitalFulfillmentService {
  async fulfillOrder(order: CommerceOrder): Promise<boolean> {
    if (!order._id || order.status !== "DIGITAL_FULFILLMENT_PENDING") {
      throw new Error("Order is not in DIGITAL_FULFILLMENT_PENDING state.");
    }

    try {
      // In a real scenario, we would fetch the product's DigitalSupplierOffer
      // and determine the fulfillmentMethod (download_url, license_key, etc.)
      const product = await getCommerceProduct(order.commerceProductId!);
      if (!product) throw new Error("Product not found");

      // Mock fulfillment logic
      console.log(`[digital-fulfillment] Fulfilling order ${order._id} for digital product ${product.id}`);
      
      // We assume delivery succeeded
      await updateOrderStatus(order._id.toString(), "FULFILLED");
      console.log(`[digital-fulfillment] Order ${order._id} successfully FULFILLED.`);
      
      // In a real system, you might send an email or deliver via Telegram here.
      // For now, we just update the state.
      return true;

    } catch (error: any) {
      console.error(`[digital-fulfillment] Fulfillment failed for order ${order._id}:`, error);
      await updateOrderStatus(order._id!.toString(), "DIGITAL_FULFILLMENT_FAILED");
      return false;
    }
  }
}

export const digitalFulfillment = new DigitalFulfillmentService();
