import { PriceVerificationResult, PriceVerifier } from "../sourcing-engine";
import { SupplierOffer, CommerceProduct } from "../../db/commerce-products";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export class AmazonWebVerifier implements PriceVerifier {
  name = "amazon_web";

  async verify(offer: SupplierOffer, product: CommerceProduct): Promise<PriceVerificationResult> {
    const sourceUrl = offer.supplierProductUrl || "";
    
    if (!sourceUrl) {
      return this.createUnknownResult(offer, product, "No supplier URL provided.");
    }

      // 1. Fetch the URL using curl to bypass Node fetch TLS fingerprint blocking (WAF)
      let html = "";
      let canonicalUrl = sourceUrl;
      try {
        const { stdout } = await execFileAsync("curl", [
          "-sSL",
          "-A", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
          "-H", "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          "-H", "Accept-Language: en-US,en;q=0.9",
          "--compressed",
          "-w", "\n%{url_effective}", // Output the final URL on a new line at the very end
          sourceUrl
        ], { maxBuffer: 10 * 1024 * 1024 });

        // Extract the final URL appended at the end
        const lines = stdout.trimEnd().split('\n');
        canonicalUrl = lines.pop() || sourceUrl;
        html = lines.join('\n');
      } catch (err: any) {
        return this.createUnknownResult(offer, product, `Curl error: ${err.message}`);
      }
      
      const asinMatch = canonicalUrl.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
      const asin = asinMatch ? asinMatch[1] : undefined;

      // Update offer if ASIN and canonical URL are found
      if (asin && canonicalUrl && canonicalUrl !== sourceUrl) {
        offer.supplierProductId = asin;
        offer.canonicalSupplierUrl = canonicalUrl;
        
        try {
          const { default: clientPromise } = await import("@/lib/mongodb");
          const client = await clientPromise;
          const db = client.db("dxbmovies");
          const { ObjectId } = await import("mongodb");
          if (offer._id) {
            await db.collection("supplier_offers").updateOne(
              { _id: new ObjectId(offer._id) },
              { $set: { supplierProductId: asin, canonicalSupplierUrl: canonicalUrl } }
            );
          }
        } catch (err) {
          console.error("[AmazonWebVerifier] Failed to persist canonical identity", err);
        }
      }

      // 2. Detect CAPTCHA or blocking
      if (
        html.includes("To discuss automated access to Amazon data please contact") ||
        html.includes("Enter the characters you see below") ||
        html.includes("Sorry, we just need to make sure you're not a robot")
      ) {
        return this.createUnknownResult(offer, product, "Amazon blocked the request (CAPTCHA/Bot Protection).", canonicalUrl);
      }

      // 3. Extract Observed Title
      // <span id="productTitle" class="a-size-large product-title-word-break">Samsung 34" Odyssey G5...</span>
      const titleMatch = html.match(/id="productTitle"[^>]*>([^<]+)</i);
      const observedTitle = titleMatch ? titleMatch[1].trim() : "Unknown";
      const matched = observedTitle !== "Unknown" && offer.supplierProductTitle.toLowerCase().split(" ")[0] === observedTitle.toLowerCase().split(" ")[0];

      // 4. Extract Price and Currency
      let livePrice: number | undefined;
      let liveCurrency: string | undefined;
      let priceType: "buy_box" | "sale" | "list" | "unknown" = "unknown";
      
      // Look for the main price block
      const offscreenMatch = html.match(/class="a-offscreen">\s*([A-Za-z$£€]+)?\s*([0-9,.]+)/i) || 
                             html.match(/id="priceblock_ourprice"[^>]*>\s*([A-Za-z$£€]+)?\s*([0-9,.]+)/i) || 
                             html.match(/id="corePriceDisplay_desktop_feature_div".*?class="a-offscreen">\s*([A-Za-z$£€]+)?\s*([0-9,.]+)/i);
      
      if (offscreenMatch) {
         livePrice = parseFloat(offscreenMatch[2].replace(/,/g, ''));
         priceType = "buy_box";
         const sym = (offscreenMatch[1] || "").trim().toUpperCase();
         if (sym === '$' || sym === 'USD') liveCurrency = 'USD';
         else if (sym === 'AED') liveCurrency = 'AED';
         else liveCurrency = sym || offer.currency;
      } else {
        // Fallback for fragmented price tags e.g. <span class="a-price-symbol">AED</span><span class="a-price-whole">1,343
        const priceWholeMatch = html.match(/class="a-price-whole">([0-9,]+)/i);
        const priceFractionMatch = html.match(/class="a-price-fraction">([0-9]+)/i);
        const priceSymbolMatch = html.match(/class="a-price-symbol">([^<]+)/i);
        
        if (priceWholeMatch) {
           let priceStr = priceWholeMatch[1].replace(/,/g, '');
           if (priceFractionMatch) {
              priceStr += '.' + priceFractionMatch[1];
           }
           livePrice = parseFloat(priceStr);
           priceType = "buy_box";
        }
        
        if (priceSymbolMatch) {
            const sym = priceSymbolMatch[1].trim().toUpperCase();
            if (sym === '$' || sym === 'USD') liveCurrency = 'USD';
            else if (sym === 'AED') liveCurrency = 'AED';
            else liveCurrency = sym;
        } else {
           liveCurrency = offer.currency;
        }
      }

      // 5. Extract Availability
      let availabilityStatus: "in_stock" | "out_of_stock" | "unknown" = "unknown";
      if (html.match(/id="availability"[^>]*>[\s\S]*?In Stock/i) || html.match(/id="availability"[^>]*>[\s\S]*?left in stock/i)) {
        availabilityStatus = "in_stock";
      } else if (html.match(/id="availability"[^>]*>[\s\S]*?Currently unavailable/i)) {
        availabilityStatus = "out_of_stock";
      }

      // 6. Return Structured Result
      if (livePrice === undefined || availabilityStatus === "unknown") {
        return this.createUnknownResult(offer, product, "Could not confidently parse price or availability from HTML.", canonicalUrl);
      }

      return {
        status: "SUCCESS",
        verificationMethod: "amazon_web",
        authoritative: false,
        confidence: 0.8, // Pretty good if we found the specific DOM nodes
        product: {
          expectedTitle: offer.supplierProductTitle,
          observedTitle,
          matched
        },
        price: {
          registeredPrice: offer.supplierPriceAtListing,
          livePrice,
          currency: liveCurrency || offer.currency,
          priceType,
          changed: livePrice !== offer.supplierPriceAtListing || liveCurrency !== offer.currency
        },
        availability: {
          status: availabilityStatus
        },
        destination: {
          country: "AE",
          supported: "unknown" // Cannot reliably detect geo-shipping constraints without a logged-in session
        },
        sourceUrl: canonicalUrl,
        checkedAt: new Date()
      };

  }

  private createUnknownResult(offer: SupplierOffer, product: CommerceProduct, notes: string, canonicalUrl?: string): PriceVerificationResult {
    return {
      status: "UNKNOWN",
      verificationMethod: "amazon_web",
      authoritative: false,
      confidence: 0.0,
      product: {
        expectedTitle: offer.supplierProductTitle,
        matched: false
      },
      sourceUrl: canonicalUrl || offer.supplierProductUrl || "unknown",
      checkedAt: new Date(),
      notes
    };
  }
}
