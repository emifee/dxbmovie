import { CommerceProvider, ProductSearchInput, MerchantProduct, ProductVerification } from "@/lib/types";

export class MockCommerceProvider implements CommerceProvider {
  async searchProducts(input: ProductSearchInput): Promise<MerchantProduct[]> {
    const results: MerchantProduct[] = [];
    
    // Simulate finding products
    if (input.query.includes("The Avengers") || input.query.includes("Marvel")) {
      // 1. Excellent match
      results.push({
        merchantProductId: "B09X4DDF24",
        title: "LEGO Marvel Infinity Saga Avengers Tower 76269",
        description: "Detailed Avengers Tower build.",
        image: "https://m.media-amazon.com/images/I/81xU-U-uHzL._AC_SX679_.jpg",
        category: "LEGO",
        price: 99.99,
        currency: "USD",
        rating: 4.8,
        reviewCount: 450,
        canonicalProductUrl: "https://amazon.com/dp/B09X4DDF24",
        affiliateUrl: "https://amazon.com/dp/B09X4DDF24?tag=dxb-20",
        merchant: "Amazon",
        availability: "in_stock"
      });
      
      // 2. Good match but out of stock
      results.push({
        merchantProductId: "B0083SBMBM",
        title: "Marvel's The Avengers (Blu-ray)",
        image: "https://m.media-amazon.com/images/I/91tPE3v6G+L._AC_UF1000,1000_QL80_.jpg",
        category: "Blu-ray",
        price: 19.99,
        currency: "USD",
        canonicalProductUrl: "https://amazon.com/dp/B0083SBMBM",
        affiliateUrl: "https://amazon.com/dp/B0083SBMBM?tag=dxb-20",
        merchant: "Amazon",
        availability: "out_of_stock"
      });
      
      // 3. Good match, missing price
      results.push({
        merchantProductId: "B01F3E1J5K",
        title: "Iron Man Electronic Helmet Replica",
        image: "https://m.media-amazon.com/images/I/71M2gI3g5YL._AC_SX679_.jpg",
        category: "Collectibles",
        price: null,
        currency: "USD",
        canonicalProductUrl: "https://amazon.com/dp/B01F3E1J5K",
        affiliateUrl: "https://amazon.com/dp/B01F3E1J5K?tag=dxb-20",
        merchant: "Amazon",
        availability: "in_stock"
      });
      
      // 4. Duplicate from another query
      results.push({
        merchantProductId: "B09X4DDF24",
        title: "LEGO Marvel Infinity Saga Avengers Tower 76269 - NEW",
        description: "Detailed Avengers Tower build.",
        image: "https://m.media-amazon.com/images/I/81xU-U-uHzL._AC_SX679_.jpg",
        category: "LEGO",
        price: 99.99,
        currency: "USD",
        rating: 4.8,
        reviewCount: 450,
        canonicalProductUrl: "https://amazon.com/dp/B09X4DDF24",
        affiliateUrl: "https://amazon.com/dp/B09X4DDF24?tag=dxb-20",
        merchant: "Amazon",
        availability: "in_stock"
      });
      
      // 5. Wrong franchise entirely (Justice League)
      results.push({
        merchantProductId: "B08JLJLJLL",
        title: "Justice League Ultimate Collector's Edition",
        description: "DC heroes unite.",
        image: "https://m.media-amazon.com/images/I/91tPE3v6G+L._AC_UF1000,1000_QL80_.jpg", // mock image
        category: "Blu-ray",
        price: 49.99,
        currency: "USD",
        rating: 4.2,
        reviewCount: 890,
        canonicalProductUrl: "https://amazon.com/dp/B08JLJLJLL",
        affiliateUrl: "https://amazon.com/dp/B08JLJLJLL?tag=dxb-20",
        merchant: "Amazon",
        availability: "in_stock"
      });
      
      // 6. Good match but broken image/link for verification failure
      results.push({
        merchantProductId: "B00BROKENX",
        title: "Avengers Logo T-Shirt (Broken Link Test)",
        description: "Official Marvel merchandise.",
        image: "",
        category: "Clothing",
        price: 24.99,
        currency: "USD",
        canonicalProductUrl: "",
        affiliateUrl: "https://amazon.com/dp/broken?tag=dxb-20",
        merchant: "Amazon",
        availability: "in_stock"
      });
      
      // 7. Wrong movie with similar title (e.g. The Toxic Avenger)
      results.push({
        merchantProductId: "B08TOXICAV",
        title: "The Toxic Avenger Blu-ray",
        description: "Cult classic horror comedy.",
        image: "https://m.media-amazon.com/images/I/91tPE3v6G+L._AC_UF1000,1000_QL80_.jpg",
        category: "Blu-ray",
        price: 19.99,
        currency: "USD",
        rating: 4.5,
        reviewCount: 120,
        canonicalProductUrl: "https://amazon.com/dp/B08TOXICAV",
        affiliateUrl: "https://amazon.com/dp/B08TOXICAV?tag=dxb-20",
        merchant: "Amazon",
        availability: "in_stock"
      });
    } else {
      // Generic match for other movies
      results.push({
        merchantProductId: `B0${input.movieProfile.movieId}`,
        title: `${input.movieProfile.title} Official Movie Poster`,
        image: "https://m.media-amazon.com/images/I/51wX-614wOL._AC_SX679_.jpg",
        category: "Art",
        price: 14.99,
        currency: "USD",
        canonicalProductUrl: `https://amazon.com/dp/B0${input.movieProfile.movieId}`,
        affiliateUrl: `https://amazon.com/dp/B0${input.movieProfile.movieId}?tag=dxb-20`,
        merchant: "Amazon",
        availability: "in_stock"
      });
    }
    
    return results;
  }

  async getProduct(productId: string): Promise<MerchantProduct | null> {
    return {
        merchantProductId: productId,
        title: "Mock Refreshed Product",
        image: "https://m.media-amazon.com/images/I/51wX-614wOL._AC_SX679_.jpg",
        category: "Art",
        price: 15.99, // simulating price change
        currency: "USD",
        canonicalProductUrl: `https://amazon.com/dp/${productId}`,
        affiliateUrl: `https://amazon.com/dp/${productId}?tag=dxb-20`,
        merchant: "Amazon",
        availability: "in_stock"
    };
  }

  async verifyProduct(productId: string): Promise<ProductVerification> {
    // Mock verification logic
    const v: ProductVerification = {
      productExists: true,
      destinationValid: productId !== "B00BROKENX",
      imageValid: true,
      priceVerified: productId !== "B01F3E1J5K",
      availabilityVerified: true,
      merchantVerified: true,
      regionVerified: true,
      passed: false
    };
    
    v.passed = v.productExists && v.destinationValid && v.imageValid && v.merchantVerified;
    return v;
  }
}
