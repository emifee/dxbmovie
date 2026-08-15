import { 
  CommerceProvider, 
  ProductSearchInput, 
  MerchantProduct, 
  ProductVerification,
  CommerceProviderError
} from "@/lib/types";

// Import fixtures for testing only
import { amazonSearchFixture, amazonGetProductFixture } from "./amazon-fixtures";

export class AmazonCreatorsProvider implements CommerceProvider {
  private readonly providerName = "amazon_creators";

  private getMarketplaceId(region?: string): string {
    const regionMap: Record<string, string> = {
      "US": "ATVPDKIKX0DER",
      "AE": "A2VIGQ35RCS4UG",
      "GB": "A1F83G8C2ARO7P",
    };
    
    // Default to configured marketplace if available
    const envRegion = process.env.AMAZON_CREATORS_MARKETPLACE || region || "US";
    const marketplace = regionMap[envRegion];
    if (!marketplace) {
      throw new CommerceProviderError(`Region ${envRegion} is not supported by Amazon.`, "REGION_UNSUPPORTED", this.providerName, false);
    }
    return marketplace;
  }

  private async getAccessToken(): Promise<string> {
    const credentialId = process.env.AMAZON_CREATORS_CREDENTIAL_ID;
    const secret = process.env.AMAZON_CREATORS_SECRET;
    
    if (!credentialId || !secret) {
      throw new CommerceProviderError("Amazon Creators API credentials not configured. Please supply AMAZON_CREATORS_CREDENTIAL_ID and AMAZON_CREATORS_SECRET.", "AUTHENTICATION_FAILED", this.providerName, false);
    }

    // In the real implementation, this would use the official SDK:
    // e.g. const client = new AmazonCreatorsClient({ credentialId, secret });
    // return client;
    
    throw new CommerceProviderError("Amazon Creators API SDK integration incomplete. Stop Condition reached.", "PROVIDER_UNAVAILABLE", this.providerName, false);
  }

  async searchProducts(input: ProductSearchInput): Promise<MerchantProduct[]> {
    const marketplaceId = this.getMarketplaceId(input.region);
    
    // Stop Condition: This will throw AUTHENTICATION_FAILED since we don't have credentials
    await this.getAccessToken();

    // ---------------------------------------------------------
    // The code below this line is unreachable in production without credentials.
    // It remains here to document the expected boundary once the SDK is available.
    // ---------------------------------------------------------
    
    console.log(`[AmazonCreatorsProvider] Searching for "${input.query}" in marketplace ${marketplaceId}...`);

    // e.g. const response = await amazonClient.search({ keywords: input.query, marketplace: marketplaceId });
    const response = amazonSearchFixture; // fall back to fixture for type checking compilation

    return response.items.map(item => this.normalizeAmazonProduct(item, input.region));
  }

  async getProduct(productId: string): Promise<MerchantProduct | null> {
    // Stop Condition: This will throw AUTHENTICATION_FAILED
    await this.getAccessToken();

    // e.g. const response = await amazonClient.getItems({ itemIds: [productId] });
    const response = amazonGetProductFixture;

    return this.normalizeAmazonProduct(response, "US");
  }

  async verifyProduct(productId: string): Promise<ProductVerification> {
    try {
      const product = await this.getProduct(productId);
      
      const v: ProductVerification = {
        productExists: !!product,
        destinationValid: !!product?.canonicalProductUrl,
        imageValid: !!product?.image,
        priceVerified: product?.price !== null,
        availabilityVerified: product?.availability === "in_stock",
        merchantVerified: product?.merchant === "Amazon",
        regionVerified: true,
        passed: false
      };
      
      v.passed = v.productExists && v.destinationValid && v.imageValid && v.merchantVerified;
      return v;
    } catch (e: any) {
      if (e.code === "AUTHENTICATION_FAILED" || e.code === "PROVIDER_UNAVAILABLE") {
        throw e; // propagate auth errors
      }
      return {
        productExists: false,
        destinationValid: false,
        imageValid: false,
        priceVerified: false,
        availabilityVerified: false,
        merchantVerified: false,
        regionVerified: false,
        passed: false
      };
    }
  }

  // NOTE: This remains available for testing against fixtures
  normalizeAmazonProduct(item: any, region?: string): MerchantProduct {
    const tld = region === "AE" ? "ae" : region === "GB" ? "co.uk" : "com";
    
    return {
      merchantProductId: item.asin,
      title: item.itemInfo?.title?.displayValue || "Unknown Product",
      description: item.itemInfo?.features?.displayValues?.join(" ") || "",
      image: item.images?.primary?.large?.url || "",
      category: "Unknown",
      price: item.offers?.listings?.[0]?.price?.amount || null,
      currency: item.offers?.listings?.[0]?.price?.currency || "USD",
      rating: null, 
      reviewCount: null,
      canonicalProductUrl: `https://www.amazon.${tld}/dp/${item.asin}`,
      affiliateUrl: item.detailPageUrl,
      merchant: "Amazon",
      availability: item.offers?.listings?.[0]?.availability?.type === "NOW" ? "in_stock" : "out_of_stock",
    };
  }
}
