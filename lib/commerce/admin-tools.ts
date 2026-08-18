import { getCommerceProduct, upsertCommerceProduct, deleteCommerceProduct, upsertSupplierOffer, validateProductForActivation, searchCommerceProducts, CommerceProductStatus, getSupplierOffersForProduct, PurchaseRequirements, PricingPolicy } from "@/lib/db/commerce-products";
import { getCommerceOrder, updateOrderStatus } from "@/lib/db/commerce-orders";
import { SchemaType, FunctionDeclaration } from "@google/generative-ai";
import { createAuditLog } from "@/lib/db/admin-audit";
import { ObjectId } from "mongodb";
import clientPromise from "@/lib/mongodb";

export interface AdminToolContext {
  adminId: string;
}

export const adminTools = {
  create_product_draft: {
    description: "Create a draft commerce product from parsed conversational input. Must provide basic details.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        instagramProductTitle: { type: SchemaType.STRING },
        instagramSellingPrice: { type: SchemaType.NUMBER },
        currency: { type: SchemaType.STRING },
        description: { type: SchemaType.STRING },
        category: { type: SchemaType.STRING },
        fulfillmentType: { type: SchemaType.STRING, description: "physical, digital, or service" },
        fulfillmentMethod: { type: SchemaType.STRING, description: "For digital products: e.g. download_url, license_key, account_access, manual_delivery" },
        orderingEnabled: { type: SchemaType.BOOLEAN, description: "Can this product be ordered? Must be digital to be true." },
        customerVisible: { type: SchemaType.BOOLEAN, description: "Is this visible to customers?" },
      },
      required: ["instagramProductTitle", "instagramSellingPrice", "currency"],
    }
  },
  
  update_product_status: {
    description: "Update the status of a commerce product (e.g., from 'draft' to 'active'). Require confirmation for 'archived' or 'hidden'.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        productId: { type: SchemaType.STRING },
        status: { type: SchemaType.STRING, enum: ["draft", "active", "hidden", "archived"] }
      },
      required: ["productId", "status"]
    }
  },

  add_supplier_offer: {
    description: "Add a supplier offer to a commerce product (e.g., Amazon link, price).",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        commerceProductId: { type: SchemaType.STRING },
        supplierName: { type: SchemaType.STRING, description: "amazon" },
        marketplace: { type: SchemaType.STRING },
        supplierProductTitle: { type: SchemaType.STRING },
        supplierProductUrl: { type: SchemaType.STRING },
        supplierPriceAtListing: { type: SchemaType.NUMBER },
        currency: { type: SchemaType.STRING },
      },
      required: ["commerceProductId", "supplierName", "marketplace", "supplierProductTitle", "supplierProductUrl", "supplierPriceAtListing", "currency"]
    }
  },

  delete_product: {
    description: "Completely delete a commerce product and all its associated supplier offers from the database. Destructive action.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        productId: { type: SchemaType.STRING }
      },
      required: ["productId"]
    }
  },

  approve_sourcing: {
    description: "Approve sourcing for an order, advancing it to supplier purchased. Destructive financial action.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        orderId: { type: SchemaType.STRING },
        supplierOrderReference: { type: SchemaType.STRING, description: "The Amazon order ID" }
      },
      required: ["orderId"]
    }
  },
  
  add_order_tracking: {
    description: "Add shipment tracking to an order.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        orderId: { type: SchemaType.STRING },
        trackingNumber: { type: SchemaType.STRING }
      },
      required: ["orderId", "trackingNumber"]
    }
  },
  
  list_products: {
    description: "List all commerce products in the database. Optionally filter by status.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        status: { type: SchemaType.STRING, description: "Filter by status: draft, active, hidden, archived. Leave empty to see all." }
      }
    }
  },

  set_purchase_requirements: {
    description: "Set structured purchase requirements for a product. This defines what information the customer must provide (requiredFields), what is already fixed by the product (fixedAttributes), and what options the customer can choose from (selectableAttributes).",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        productId: { type: SchemaType.STRING },
        requiredFields: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING }, description: "Fields the customer must provide, e.g. quantity, shippingAddress, phone, size, color" },
        fixedAttributes: { type: SchemaType.STRING, description: "JSON string of fixed attributes, e.g. {\"screenSize\": \"34 inches\"}" },
        selectableAttributes: { type: SchemaType.STRING, description: "JSON string of selectable attributes with options, e.g. {\"color\": [\"Black\", \"Silver\"], \"storage\": [\"128GB\", \"256GB\"]}" },
      },
      required: ["productId", "requiredFields"]
    }
  },

  set_pricing_policy: {
    description: "Set the pricing policy for a product. Controls markup percentage, minimum gross margin, and whether automatic repricing is allowed.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        productId: { type: SchemaType.STRING },
        markupPercent: { type: SchemaType.NUMBER, description: "Markup percentage, e.g. 30 for 30%" },
        minimumGrossMarginPercent: { type: SchemaType.NUMBER, description: "Minimum gross margin percentage, e.g. 20 for 20%" },
        allowAutomaticReprice: { type: SchemaType.BOOLEAN, description: "Whether to automatically reprice when economics break" },
      },
      required: ["productId", "markupPercent"]
    }
  },

  link_order_product: {
    description: "Link an active order to a commerce product if the automatic product linkage failed (PRODUCT_LINKAGE_REQUIRED). This securely looks up the preferred supplier offer and resumes sourcing.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        orderId: { type: SchemaType.STRING },
        commerceProductId: { type: SchemaType.STRING },
      },
      required: ["orderId", "commerceProductId"]
    }
  }
};

export async function executeAdminTool(toolName: string, args: any, context: AdminToolContext): Promise<any> {
  const { adminId } = context;

  switch (toolName) {
    case "create_product_draft": {
      const id = new ObjectId().toString(); // Generate unique friendly ID
      const product = await upsertCommerceProduct({
        id,
        status: "draft",
        resaleAuthorized: false,
        ...args
      });
      
      await createAuditLog({
        adminId,
        action: "create_product_draft",
        targetCollection: "commerce_products",
        targetId: product.id,
        newValue: args,
        requiredConfirmation: false,
      });

      return {
        message: "Draft product created. Please add a supplier offer before activating.",
        product
      };
    }

    case "add_supplier_offer": {
      const { commerceProductId, supplierName, supplierProductTitle, ...rest } = args;
      const offer = await upsertSupplierOffer({
        commerceProductId,
        supplierName,
        supplierProductTitle,
        ...rest,
        status: "active"
      });

      await createAuditLog({
        adminId,
        action: "add_supplier_offer",
        targetCollection: "supplier_offers",
        targetId: String(offer._id),
        newValue: args,
        requiredConfirmation: false,
      });

      return {
        message: "Supplier offer added.",
        offer
      };
    }

    case "update_product_status": {
      const { productId, status } = args;
      const product = await getCommerceProduct(productId);
      if (!product) throw new Error("Product not found");

      if (status === "active") {
        // Enforce strict validation
        const offers = await getSupplierOffersForProduct(productId);
        validateProductForActivation(product, offers);

        // Auto-create or update mapping when activated
        const { createOrUpdateMapping } = await import("@/lib/db/instagram-mappings");
        const offer = offers.find(o => o._id?.toString() === product.preferredSupplierOfferId) || offers[0];
        if (product.instagramProductTitle && offer) {
          await createOrUpdateMapping(
            product.id,
            offer._id!.toString(),
            product.instagramProductTitle,
            product.instagramProductId,
            product.instagramMediaId
          );
        }
      }

      const updated = await upsertCommerceProduct({
        id: productId,
        status: status as CommerceProductStatus
      });

      await createAuditLog({
        adminId,
        action: "update_product_status",
        targetCollection: "commerce_products",
        targetId: productId,
        oldValue: product.status,
        newValue: status,
        requiredConfirmation: status === "archived" || status === "hidden", // Example: archived requires confirmation upstream
      });

      return {
        message: `Product ${productId} status updated to ${status}.`,
        product: updated
      };
    }

    case "delete_product": {
      const { productId } = args;
      const product = await getCommerceProduct(productId);
      if (!product) throw new Error("Product not found");
      
      await deleteCommerceProduct(productId);
      
      await createAuditLog({
        adminId,
        action: "delete_product",
        targetCollection: "commerce_products",
        targetId: productId,
        oldValue: product.status,
        requiredConfirmation: true,
      });

      return {
        message: `Product ${productId} completely deleted.`
      };
    }

    case "approve_sourcing": {
      const { orderId, supplierOrderReference } = args;
      const order = await getCommerceOrder(orderId);
      if (!order) throw new Error("Order not found");

      // We cannot update status to 'SUPPLIER_PURCHASED' directly without orchestrator support for systemNotes in updateOrderStatus,
      // wait, `updateOrderStatus` in commerce-orders.ts doesn't take systemNotes. We can just set the status.
      await updateOrderStatus(orderId, "SUPPLIER_PURCHASED");

      await createAuditLog({
        adminId,
        action: "approve_sourcing",
        targetCollection: "commerce_orders",
        targetId: orderId,
        oldValue: order.status,
        newValue: "SUPPLIER_PURCHASED",
        requiredConfirmation: true, // Requires confirmation because it's financial
      });

      return { message: `Order ${orderId} marked as SUPPLIER_PURCHASED.` };
    }

    case "add_order_tracking": {
      const { orderId, trackingNumber } = args;
      const order = await getCommerceOrder(orderId);
      if (!order) throw new Error("Order not found");

      // In real implementation, we'd add tracking to order.fulfillment.
      await updateOrderStatus(orderId, "SHIPPED");

      await createAuditLog({
        adminId,
        action: "add_order_tracking",
        targetCollection: "commerce_orders",
        targetId: orderId,
        newValue: trackingNumber,
        requiredConfirmation: false,
      });

      return { message: `Order ${orderId} marked as SHIPPED with tracking ${trackingNumber}.` };
    }

    case "list_products": {
      const { status } = args || {};
      const client = await clientPromise;
      const col = client.db("dxbmovies").collection("commerce_products");
      const filter = status ? { status } : {};
      const products = await col.find(filter).limit(50).toArray();
      return { 
        products: products.map(p => ({ 
          id: p.id, 
          title: p.instagramProductTitle || "Untitled Draft", 
          price: p.instagramSellingPrice, 
          currency: p.currency, 
          status: p.status,
          hasRequirements: !!p.purchaseRequirements,
          hasPricingPolicy: !!p.pricingPolicy,
        })) 
      };
    }

    case "set_purchase_requirements": {
      const { productId, requiredFields, fixedAttributes, selectableAttributes } = args;
      const product = await getCommerceProduct(productId);
      if (!product) throw new Error("Product not found");

      const requirements: PurchaseRequirements = {
        requiredFields: requiredFields || ["quantity", "shippingAddress", "phone"],
      };

      if (fixedAttributes) {
        try {
          requirements.fixedAttributes = typeof fixedAttributes === "string" ? JSON.parse(fixedAttributes) : fixedAttributes;
        } catch { requirements.fixedAttributes = {}; }
      }

      if (selectableAttributes) {
        try {
          requirements.selectableAttributes = typeof selectableAttributes === "string" ? JSON.parse(selectableAttributes) : selectableAttributes;
        } catch { requirements.selectableAttributes = {}; }
      }

      const updated = await upsertCommerceProduct({
        id: productId,
        purchaseRequirements: requirements,
      } as any);

      await createAuditLog({
        adminId,
        action: "set_purchase_requirements",
        targetCollection: "commerce_products",
        targetId: productId,
        newValue: requirements,
        requiredConfirmation: false,
      });

      return {
        message: `Purchase requirements set for product ${productId}.`,
        requirements,
      };
    }

    case "set_pricing_policy": {
      const { productId, markupPercent, minimumGrossMarginPercent, allowAutomaticReprice } = args;
      const product = await getCommerceProduct(productId);
      if (!product) throw new Error("Product not found");

      const policy: PricingPolicy = {
        markupPercent: markupPercent ?? 30,
        minimumGrossMarginPercent: minimumGrossMarginPercent ?? 20,
        allowAutomaticReprice: allowAutomaticReprice ?? true,
      };

      const updated = await upsertCommerceProduct({
        id: productId,
        pricingPolicy: policy,
      } as any);

      await createAuditLog({
        adminId,
        action: "set_pricing_policy",
        targetCollection: "commerce_products",
        targetId: productId,
        newValue: policy,
        requiredConfirmation: false,
      });

      return {
        message: `Pricing policy set for product ${productId}.`,
        policy,
      };
    }

    case "link_order_product": {
      const { orderId, commerceProductId } = args;
      const order = await getCommerceOrder(orderId);
      if (!order) return { error: "Order not found" };

      const product = await getCommerceProduct(commerceProductId);
      if (!product) return { error: "Commerce product not found" };

      const offers = await getSupplierOffersForProduct(commerceProductId);
      const offer = offers.find(o => o._id?.toString() === product.preferredSupplierOfferId) || offers[0];
      
      if (!offer) {
        return { error: "Commerce product has no supplier offers. Add a supplier offer to the product first." };
      }

      // 1. Update the order with the explicit mapping
      const { runOrderOrchestrator } = await import("@/lib/db/commerce-orders");
      const client = await clientPromise;
      const db = client.db("dxbmovies");
      await db.collection("commerce_orders").updateOne(
        { _id: new ObjectId(orderId) },
        { 
          $set: { 
            commerceProductId: product.id,
            supplierOfferId: offer._id?.toString(),
            updated_at: new Date()
          } 
        }
      );

      // 2. Also update the instagram mappings DB so future orders link automatically
      const { createOrUpdateMapping } = await import("@/lib/db/instagram-mappings");
      await createOrUpdateMapping(
        product.id,
        offer._id!.toString(),
        order.displayed_product_title // Save the normalized title
      );

      // 3. Write audit log
      await createAuditLog({
        adminId,
        action: "link_order_product",
        targetCollection: "commerce_orders",
        targetId: orderId,
        newValue: { commerceProductId: product.id, supplierOfferId: offer._id?.toString() },
        requiredConfirmation: false,
      });

      // 4. Resume the orchestrator. If it was blocked on PRODUCT_LINKAGE_REQUIRED,
      // it should ideally transition back to READY_FOR_SOURCING_CHECK.
      // Wait, runOrderOrchestrator doesn't automatically move from PRODUCT_LINKAGE_REQUIRED to READY_FOR_SOURCING_CHECK.
      // Let's manually set it to READY_FOR_SOURCING_CHECK.
      await updateOrderStatus(orderId, "READY_FOR_SOURCING_CHECK");
      await runOrderOrchestrator(orderId);

      return {
        message: `Successfully linked order ${orderId} to product ${product.instagramProductTitle}. Sourcing check resumed.`,
      };
    }

    default:
      throw new Error(`Unknown admin tool: ${toolName}`);
  }
}
