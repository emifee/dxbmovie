import webpush from "web-push";

// Configure VAPID once (safe to call multiple times — webpush handles it)
const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY!;
const vapidEmail = process.env.VAPID_EMAIL || "mailto:hello@dxbmovies.com";

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(vapidEmail, vapidPublicKey, vapidPrivateKey);
}

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  url: string;
  type: "ai_response" | "ai_proactive" | "trending" | "leaving_soon";
}

export interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

/**
 * Send a push notification to a single subscription.
 * Returns true on success, false on fatal errors (410 Gone = subscription expired).
 * Throws on other errors so the caller can decide how to handle them.
 */
export async function sendPushNotification(
  subscription: PushSubscriptionData,
  payload: PushPayload,
): Promise<{ success: boolean; gone: boolean }> {
  if (!vapidPublicKey || !vapidPrivateKey) {
    console.warn("[push] VAPID keys not configured — skipping notification");
    return { success: false, gone: false };
  }

  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
        },
      },
      JSON.stringify({
        ...payload,
        icon: payload.icon ?? "/icons/icon-192.png",
        badge: payload.badge ?? "/icons/badge-72.png",
      }),
    );
    return { success: true, gone: false };
  } catch (err: unknown) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 410 || status === 404) {
      // Subscription expired / unregistered — caller should clean up
      return { success: false, gone: true };
    }
    console.error("[push] sendNotification error:", err);
    return { success: false, gone: false };
  }
}
