import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import type { 
  CommerceProvider, 
  ProductSearchInput, 
  MerchantProduct, 
  CommerceMovieProfile,
  MovieProduct,
  DiscoveryRun,
  CommerceProviderError
} from "@/lib/types";

export class CommerceEngine {
  private provider: CommerceProvider;

  constructor(provider: CommerceProvider) {
    this.provider = provider;
  }

  private generateSearchIntents(profile: CommerceMovieProfile): ProductSearchInput[] {
    const intents: ProductSearchInput[] = [];
    
    // Core searches
    intents.push({ query: `${profile.title} ${profile.year} Blu-ray`, movieProfile: profile });
    intents.push({ query: `${profile.title} poster`, movieProfile: profile });
    
    if (profile.franchises.length > 0) {
      intents.push({ query: `${profile.franchises[0]} collectibles`, movieProfile: profile });
      intents.push({ query: `${profile.franchises[0]} LEGO`, movieProfile: profile });
    }
    
    // Some character specific searches
    profile.characters.slice(0, 2).forEach(char => {
      intents.push({ query: `${char} ${profile.title} merchandise`, movieProfile: profile });
    });

    return intents;
  }

  private scoreProduct(product: MerchantProduct, profile: CommerceMovieProfile): { score: number, signals: Record<string, number>, penalties: Record<string, number>, reason: string } {
    let score = 0;
    const signals: Record<string, number> = {};
    const penalties: Record<string, number> = {};
    const titleLower = product.title.toLowerCase();
    const descLower = (product.description || "").toLowerCase();
    const fullText = titleLower + " " + descLower;
    
    // Signals
    if (fullText.includes(profile.title.toLowerCase())) {
      signals["movieTitle"] = 0.40;
    }
    if (profile.franchises.some(f => fullText.includes(f.toLowerCase()))) {
      signals["franchise"] = 0.30;
    }
    if (profile.characters.some(c => fullText.includes(c.toLowerCase()))) {
      signals["character"] = 0.20;
    }
    
    signals["merchantConfidence"] = 0.10; // Base confidence

    // Penalties
    if (titleLower.includes("justice league") && profile.title.toLowerCase().includes("avenger")) {
      penalties["wrongFranchise"] = 0.50;
    }
    if (titleLower.includes("toxic avenger") && profile.title.toLowerCase() === "the avengers") {
      penalties["wrongMovieSimilarTitle"] = 0.80;
    }
    
    const totalSignals = Object.values(signals).reduce((a, b) => a + b, 0);
    const totalPenalties = Object.values(penalties).reduce((a, b) => a + b, 0);
    
    score = Math.max(0, totalSignals - totalPenalties);
    
    let reason = "Product matches several key movie signals.";
    if (totalPenalties > 0) {
      reason = "Product penalized for potentially incorrect franchise/movie matches.";
    } else if (score > 0.8) {
      reason = "Strong match for franchise and movie title.";
    }

    return { score, signals, penalties, reason };
  }

  async runDiscovery(movieId: string | number): Promise<MovieProduct[]> {
    const startedAt = new Date();
    const providerName = (this.provider as any).providerName || "unknown_provider";
    const region = "US"; // default for now, could be dynamic
    
    const runMetrics: DiscoveryRun = {
      movieId,
      provider: providerName,
      region,
      queriesGenerated: [],
      resultsReturned: 0,
      resultsDeduplicated: 0,
      resultsRejected: 0,
      resultsNeedsReview: 0,
      resultsActivated: 0,
      startedAt: startedAt.toISOString(),
      completedAt: "",
      durationMs: 0,
      status: "success",
    };

    // 1. Fetch movie profile (Mocking a DB/TMDB call for now)
    const profile: CommerceMovieProfile = {
      movieId,
      title: movieId == 24428 ? "The Avengers" : "Unknown Movie",
      year: "2012",
      franchises: ["Marvel", "MCU"],
      characters: ["Iron Man", "Thor", "Captain America", "Hulk"],
      sourceMaterial: ["Comic"],
      genres: ["Action", "Sci-Fi"],
      studios: ["Marvel Studios"],
      merchandisePotential: ["High"]
    };

    // 2. Generate Search Intents
    const intents = this.generateSearchIntents(profile);
    runMetrics.queriesGenerated = intents.map(i => i.query);
    
    const rawResults: MerchantProduct[] = [];
    
    // 3. Search Provider & Deduplicate
    try {
      for (const intent of intents) {
        intent.region = region;
        // Basic transient error retry block
        let attempt = 0;
        let success = false;
        while (attempt < 3 && !success) {
          try {
            const results = await this.provider.searchProducts(intent);
            rawResults.push(...results);
            success = true;
          } catch (e: any) {
            attempt++;
            if (e.name === "CommerceProviderError") {
              const err = e as CommerceProviderError;
              if (!err.retryable) {
                throw err;
              }
            }
            if (attempt >= 3) throw e;
            await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt))); // exponential backoff
          }
        }
      }
    } catch (e: any) {
      console.error("[CommerceEngine] Discovery failed:", e);
      runMetrics.status = "failed";
      runMetrics.errorCode = e.code || "UNKNOWN";
      runMetrics.errorMessage = e.message;
      this.saveDiscoveryRun(runMetrics, startedAt);
      throw e; // rethrow to let the caller handle UI rendering
    }
    
    runMetrics.resultsReturned = rawResults.length;

    const uniqueProducts = new Map<string, MerchantProduct>();
    for (const p of rawResults) {
      // Deduplicate by provider + merchantProductId + region
      const key = `${providerName}_${p.merchantProductId}_${region}`;
      if (!uniqueProducts.has(key)) {
        uniqueProducts.set(key, p);
      }
    }
    runMetrics.resultsDeduplicated = uniqueProducts.size;
    
    const client = await clientPromise;
    const db = client.db("dxbmovies");
    const productsCol = db.collection("products");
    
    const processedProducts: MovieProduct[] = [];
    const autoPublish = process.env.LIVE_PROVIDER_AUTO_PUBLISH === "true" || providerName === "mock_provider";
    
    // 4. Score, Verify, and Save
    for (const [key, p] of Array.from(uniqueProducts.entries())) {
      const { score, signals, penalties, reason } = this.scoreProduct(p, profile);
      const verification = await this.provider.verifyProduct(p.merchantProductId);
      
      let status: MovieProduct["status"] = "discovered";
      
      if (score < 0.65) {
        status = "rejected";
        runMetrics.resultsRejected++;
      } else if (score >= 0.85 && verification.passed) {
        // Obey manual review flag
        if (autoPublish) {
          status = "active";
          runMetrics.resultsActivated++;
        } else {
          status = "needs_review";
          runMetrics.resultsNeedsReview++;
        }
      } else {
        status = "needs_review";
        runMetrics.resultsNeedsReview++;
      }
      
      if (!verification.passed && status !== "rejected") {
        status = "needs_review";
      }
      
      const now = new Date().toISOString();
      const productDoc: MovieProduct = {
        id: new ObjectId().toString(),
        movieId: movieId.toString(),
        title: p.title,
        description: p.description,
        image: p.image,
        category: p.category,
        price: p.price,
        currency: p.currency,
        rating: p.rating,
        reviewCount: p.reviewCount,
        
        status,
        enabled: status === "active",
        availability: p.availability,
        
        provider: providerName,
        merchant: p.merchant,
        merchantProductId: p.merchantProductId,
        canonicalProductUrl: p.canonicalProductUrl,
        affiliateUrl: p.affiliateUrl,
        discoveryMethod: "automated_search",
        sourceRegion: region,
        
        relevanceScore: score,
        signals,
        penalties,
        relevanceReason: reason,
        verification,
        
        discoveredAt: now,
        lastVerifiedAt: now,
        createdAt: now,
        updatedAt: now
      };
      
      // Upsert into DB
      await productsCol.updateOne(
        { provider: productDoc.provider, merchantProductId: productDoc.merchantProductId, sourceRegion: productDoc.sourceRegion },
        { $set: productDoc },
        { upsert: true }
      );
      
      processedProducts.push(productDoc);
    }
    
    await this.saveDiscoveryRun(runMetrics, startedAt);
    return processedProducts;
  }

  async reverifyProduct(productId: string): Promise<MovieProduct | null> {
    const client = await clientPromise;
    const db = client.db("dxbmovies");
    const productsCol = db.collection("products");
    
    const existing = await productsCol.findOne({ _id: new ObjectId(productId) });
    if (!existing) return null;

    try {
      // 1. Fetch fresh data from provider
      const freshData = await this.provider.getProduct(existing.merchantProductId);
      if (freshData) {
        existing.price = freshData.price;
        existing.availability = freshData.availability;
        existing.title = freshData.title; // optionally update title
        existing.image = freshData.image; // optionally update image
      }

      // 2. Re-verify the fields
      const verification = await this.provider.verifyProduct(existing.merchantProductId);
      existing.verification = verification;
      
      if (!verification.passed && existing.status === "active") {
        existing.status = "needs_review";
        existing.enabled = false;
      }
      
      existing.lastVerifiedAt = new Date().toISOString();
      existing.updatedAt = new Date().toISOString();
      
      await productsCol.updateOne(
        { _id: new ObjectId(productId) },
        { $set: { 
          price: existing.price,
          availability: existing.availability,
          title: existing.title,
          image: existing.image,
          verification: existing.verification,
          status: existing.status,
          enabled: existing.enabled,
          lastVerifiedAt: existing.lastVerifiedAt,
          updatedAt: existing.updatedAt
        }}
      );

      return {
        ...existing,
        id: existing._id.toString()
      } as MovieProduct;

    } catch (e) {
      console.error(`Failed to reverify product ${productId}:`, e);
      return null;
    }
  }

  private async saveDiscoveryRun(metrics: DiscoveryRun, startedAt: Date) {
    try {
      const completedAt = new Date();
      metrics.completedAt = completedAt.toISOString();
      metrics.durationMs = completedAt.getTime() - startedAt.getTime();

      const client = await clientPromise;
      const db = client.db("dxbmovies");
      await db.collection("discovery_runs").insertOne(metrics);
    } catch (e) {
      console.error("Failed to save discovery run metrics", e);
    }
  }
}
