"use client";

const LS_KEY = "dxb:push-state";

interface PushState {
  decided: boolean;       // user has made a permission decision
  subscribed: boolean;    // successfully subscribed
  deniedAt?: number;      // epoch ms when denied (don't re-ask for 30 days)
}

export function loadPushState(): PushState {
  if (typeof window === "undefined") return { decided: false, subscribed: false };
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? { decided: false, subscribed: false, ...JSON.parse(raw) } : { decided: false, subscribed: false };
  } catch {
    return { decided: false, subscribed: false };
  }
}

export function savePushState(state: PushState) {
  if (typeof window === "undefined") return;
  localStorage.setItem(LS_KEY, JSON.stringify(state));
}

/** Register the custom service worker at /sw.js */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    return reg;
  } catch (err) {
    console.error("[sw] Registration failed:", err);
    return null;
  }
}

/** Request notification permission and subscribe to push. */
export async function subscribeToPush(): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator)) {
    return false;
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    savePushState({ decided: true, subscribed: false, deniedAt: Date.now() });
    return false;
  }

  try {
    const reg = await navigator.serviceWorker.ready;
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!publicKey) {
      console.error("[push] NEXT_PUBLIC_VAPID_PUBLIC_KEY not set");
      return false;
    }

    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as unknown as ArrayBuffer,
    });

    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(subscription.toJSON()),
    });

    if (res.ok) {
      savePushState({ decided: true, subscribed: true });
      return true;
    }
    return false;
  } catch (err) {
    console.error("[push] Subscribe error:", err);
    return false;
  }
}

/** Unsubscribe and notify server */
export async function unsubscribeFromPush(): Promise<void> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await sub.unsubscribe();
      await fetch("/api/push/unsubscribe", { method: "POST" });
    }
    savePushState({ decided: true, subscribed: false });
  } catch (err) {
    console.error("[push] Unsubscribe error:", err);
  }
}

// Helper: convert the VAPID public key from base64url to Uint8Array
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    output[i] = rawData.charCodeAt(i);
  }
  return output;
}
