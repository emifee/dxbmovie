import { SupplierOffer } from "@/lib/db/commerce-products";

export interface SupplierCheckResult {
  offerId: string;
  
  productMatch: {
    matched: boolean;
    confidence: number;
    matchedBy: "supplier_product_id" | "exact_url" | "exact_title" | "title_brand_model" | "manual";
  };

  variant: {
    sizeRequested?: string;
    sizeAvailable?: boolean;

    colorRequested?: string;
    colorAvailable?: boolean;

    quantityRequested: number;
    quantityAvailable?: boolean;
  };

  pricing: {
    liveUnitPrice: number;
    supplierShipping?: number;
    estimatedTaxes?: number;
    paymentGatewayFee?: number;
    fxBuffer?: number;
    riskBuffer?: number;
    currency: string;
    estimatedLandedCost: number;
  };

  destination: {
    country?: string;
    supported?: boolean;
  };

  availability: "in_stock" | "low_stock" | "out_of_stock" | "unknown";
  
  sourceUrl?: string;
  source: string; // e.g. "mock", "amazon_live"
  checkedAt: Date;
}

export interface SupplierSearchQuery {
  title: string;
  brand?: string;
  model?: string;
  category?: string;
}

export interface SupplierProvider {
  name: string;
  isMock: boolean;
  
  getProductById?(supplierProductId: string): Promise<SupplierCheckResult | null>;
  
  getProductByUrl?(url: string): Promise<SupplierCheckResult | null>;
  
  searchExactProduct?(query: SupplierSearchQuery): Promise<SupplierCheckResult[]>;
  
  checkVariantAvailability(
    offer: SupplierOffer,
    requestedVariant: {
      size?: string;
      color?: string;
      quantity: number;
      shippingCountry?: string;
    }
  ): Promise<SupplierCheckResult>;
}
