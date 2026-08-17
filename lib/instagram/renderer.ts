import {
  sendTextMessage,
  sendImageMessage,
  sendMediaShare,
  sendQuickReplies,
  sendGenericTemplate,
} from "./client";
import { getCommerceProduct } from "@/lib/db/commerce-products";
import clientPromise from "@/lib/mongodb";

const TMDB_BASE = "https://api.themoviedb.org/3";

export async function resolveMoviePresentationAsset(params: {
  movieId?: string;
  tmdbId?: number;
  mediaId?: string;
  mediaType?: "movie" | "tv";
}): Promise<{ type: "media_share" | "image_url" | "unavailable"; value?: string }> {
  const { tmdbId, mediaId, mediaType = "movie" } = params;

  // 1. Explicit Trusted mediaId
  if (mediaId) {
    return { type: "media_share", value: mediaId };
  }

  // 2. Existing instagram_media_mappings lookup
  if (tmdbId) {
    try {
      const client = await clientPromise;
      const db = client.db("dxbmovies");
      // Find mapped media
      const mapping = await db.collection("instagram_media_mappings").findOne({
        "metadata.tmdbId": tmdbId,
        "metadata.mediaType": mediaType
      });
      if (mapping?.mediaId) {
        return { type: "media_share", value: mapping.mediaId };
      }
    } catch (e) {
      console.error("[renderer] Failed to lookup instagram_media_mappings:", e);
    }

    // 3. TMDB poster path
    try {
      const apiKey = process.env.TMDB_API_KEY;
      if (apiKey) {
        const res = await fetch(`${TMDB_BASE}/${mediaType}/${tmdbId}?api_key=${apiKey}`);
        if (res.ok) {
          const data = await res.json();
          if (data.poster_path) {
            return { type: "image_url", value: `https://image.tmdb.org/t/p/w500${data.poster_path}` };
          }
        }
      }
    } catch (e) {
      console.error("[renderer] Failed to fetch TMDB poster:", e);
    }
  }

  return { type: "unavailable" };
}

export function assertSafeCustomerMessage(message: string, fallbackMessage: string = "I am processing your request. Please wait."): string {
  if (!message || message.trim() === "") return fallbackMessage;
  
  const isJson = /^[\{\[]/.test(message.trim());
  if (isJson) {
    try {
      JSON.parse(message);
      console.error("[renderer] BLOCKING LEAKED JSON:", message);
      return fallbackMessage;
    } catch {
      // Not strict JSON, but looks suspicious. We block it if it contains internal keys.
    }
  }

  const blockedKeys = ["quantity", "shippingAddress", "fieldResolutions", "normalizedValue", "commerceProductId"];
  for (const key of blockedKeys) {
    if (message.includes(`"${key}"`) || message.includes(`'${key}'`)) {
      console.error("[renderer] BLOCKING LEAKED INTERNAL KEYS:", message);
      return fallbackMessage;
    }
  }

  return message;
}

export async function renderPresentation(recipientId: string, response: any): Promise<void> {
  let { content, presentation } = response;
  
  if (content) {
    content = assertSafeCustomerMessage(content);
  }
  
  if (!presentation) {
    if (content) {
      await sendTextMessage(recipientId, content);
    }
    return;
  }

  const deliveryMode = presentation.deliveryMode || "text_then_media";

  // Pre-send text if mode demands it
  if (content && deliveryMode === "text_then_media") {
    await sendTextMessage(recipientId, content);
  }

  try {
    switch (presentation.type) {
      case "image": {
        let rendererBranch = "unknown";
        let metaResponseStatus = "pending";
        let metaMessageId = "none";
        let errorMsg = "none";
        
        const asset = await resolveMoviePresentationAsset({
          movieId: presentation.movieId,
          tmdbId: presentation.tmdbId,
          mediaId: presentation.mediaId,
          mediaType: presentation.mediaType
        });
        
        try {
          if (asset.type === "media_share" && asset.value) {
            rendererBranch = "sendMediaShare";
            const res = await sendMediaShare(recipientId, asset.value);
            metaResponseStatus = res.success ? "success" : "failed";
            metaMessageId = res.messageId || "none";
            if (res.error) errorMsg = JSON.stringify(res.error);
          } else if (asset.type === "image_url" && asset.value) {
            rendererBranch = "sendImageMessage";
            const res = await sendImageMessage(recipientId, asset.value);
            metaResponseStatus = res.success ? "success" : "failed";
            metaMessageId = res.messageId || "none";
            if (res.error) errorMsg = JSON.stringify(res.error);
          } else {
            rendererBranch = "unavailable";
          }
        } catch (e: any) {
          errorMsg = e.message;
        }

        console.log(`\n=== META RENDERER TRACE ===\n` + JSON.stringify({
          recipientId,
          ownedMediaLookupResult: asset.type === "media_share" ? "found" : "not_found",
          tmdbPosterPath: asset.type === "image_url" ? asset.value : "none",
          rendererBranch,
          metaResponseStatus,
          metaMessageId,
          error: errorMsg
        }, null, 2) + `\n===========================\n`);
        
        // If embedded, fallback to sending text after image (since image can't embed text easily in API)
        if (content && deliveryMode === "embedded") {
          await sendTextMessage(recipientId, content);
        }
        break;
      }
      
      case "movie_card": {
        let imageUrl = "https://via.placeholder.com/500x750?text=No+Poster";
        const asset = await resolveMoviePresentationAsset({
          tmdbId: presentation.tmdbId,
          mediaType: presentation.mediaType
        });
        if (asset.type === "image_url" && asset.value) {
          imageUrl = asset.value;
        }

        const buttons: any[] = [];
        if (presentation.actions?.includes("more_details")) {
          buttons.push({ type: "postback", title: "More Details", payload: `MOVIE_DETAILS_${presentation.tmdbId}` });
        }
        if (presentation.actions?.includes("similar_movies")) {
          buttons.push({ type: "postback", title: "Similar Titles", payload: `SIMILAR_MOVIES_${presentation.tmdbId}` });
        }

        const title = content && deliveryMode === "embedded" ? content.substring(0, 80) : "Movie Recommendation";
        
        await sendGenericTemplate(recipientId, [{
          title: title,
          subtitle: `TMDB ID: ${presentation.tmdbId}`,
          image_url: imageUrl,
          buttons: buttons.length > 0 ? buttons : undefined
        }]);
        break;
      }
      
      case "commerce_card": {
        const { getActiveOrderForCustomer } = await import("@/lib/db/commerce-orders");
        const order = await getActiveOrderForCustomer(recipientId);
        
        if (presentation.action === "pay") {
          if (!order || order.status !== "READY_FOR_PAYMENT") {
            throw new Error("PAYMENT_PRESENTATION_NOT_AUTHORIZED");
          }
        }

        const product = await getCommerceProduct(presentation.commerceProductId);
        if (!product) throw new Error("Product not found");

        const buttons: any[] = [];
        if (presentation.action === "pay" && order?.checkoutUrl) {
          buttons.push({ type: "web_url", title: "Pay securely", url: order.checkoutUrl });
        } else {
          buttons.push({ type: "postback", title: "View details", payload: `VIEW_PRODUCT_${product.id}` });
        }

        let titleStr = product.instagramProductTitle || "Product";
        let subStr = `${product.currency} ${product.instagramSellingPrice}`;
        
        if (content && deliveryMode === "embedded") {
          titleStr = content.substring(0, 80);
          subStr = product.instagramProductTitle;
        }

        await sendGenericTemplate(recipientId, [{
          title: titleStr,
          subtitle: subStr,
          image_url: product.images?.[0] || "https://via.placeholder.com/500x500",
          buttons: buttons.length > 0 ? buttons : undefined
        }]);
        break;
      }
      
      case "quick_replies": {
        const textStr = (content && deliveryMode !== "media_only") ? content : "Please choose an option:";
        const options = presentation.options || [];
        const qrPayload = options.map((o: any) => ({
          content_type: "text",
          title: o.label.substring(0, 20),
          payload: o.payload
        }));
        await sendQuickReplies(recipientId, textStr, qrPayload);
        break;
      }
      
      default:
        // Unknown presentation type, fallback to text if available
        if (content && deliveryMode === "embedded") {
          await sendTextMessage(recipientId, content);
        }
        break;
    }
  } catch (err) {
    console.error(`[renderer] Failed to render presentation for ${recipientId}:`, err);
    // Safe fallback
    if (content && deliveryMode === "embedded") {
      await sendTextMessage(recipientId, content);
    }
  }
}
