"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useAccountStore } from "@/lib/account-store";
import { getAndClearPendingAction } from "@/lib/pending-actions";
import { clearAnonPrefs } from "@/lib/anon-prefs";
import { useUIStore } from "@/lib/store";
import { trackEvent } from "@/lib/analytics";

/**
 * Loads persisted account/usage state from localStorage on mount and syncs
 * the NextAuth session into the Zustand store. When the user signs in via
 * Google OAuth the store's `signedIn` flag flips automatically; sign-out does
 * the same in reverse.
 */
export function AccountHydrator() {
  const { data: session, status } = useSession();
  const hydrate = useAccountStore((s) => s.hydrate);
  const storeSignIn = useAccountStore((s) => s.signIn);
  const storeSignOut = useAccountStore((s) => s.signOut);

  // Hydrate localStorage usage counters once on mount.
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Keep the Zustand store in sync with the NextAuth session.
  useEffect(() => {
    if (status === "authenticated" && session?.user?.email) {
      const email = session.user.email;
      const trackKey = `dxb_login_tracked_${email}`;
      
      if (!localStorage.getItem(trackKey)) {
        trackEvent("login_success");
        localStorage.setItem(trackKey, "1");
        
        const source = localStorage.getItem("dxb_signup_source");
        if (source) {
          fetch("/api/user/track-signup-source", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ source }),
          }).catch(console.error);
          localStorage.removeItem("dxb_signup_source");
        }
        
        // Merge anonymous preferences
        const deviceId = localStorage.getItem("dxb_device_id");
        if (deviceId) {
          fetch("/api/anon/merge", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ deviceId }),
          })
          .then(() => clearAnonPrefs())
          .catch(console.error);
        }

        // Sync pending watch click from server
        fetch("/api/user/watch-click")
          .then((res) => res.json())
          .then((data) => {
            if (data.watchClick) {
              localStorage.setItem("dxb_last_watch_click", JSON.stringify(data.watchClick));
            }
          })
          .catch(console.error);
      }
      storeSignIn(session.user.email);
      
      // Handle any pending actions from before sign in
      const pending = getAndClearPendingAction();
      if (pending) {
        if (pending.type === "add_watchlist") {
          fetch("/api/user/watchlist", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ movie: pending.movie }),
          });
        } else if (pending.type === "reaction") {
          fetch("/api/user/reactions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ movieId: pending.movieId, reaction: pending.reaction }),
          });
        } else if (pending.type === "open_chat") {
          // Open chat with optional context and drafted message
          setTimeout(() => {
            const ui = useUIStore.getState();
            if (pending.movie) ui.openChat(pending.movie);
            else ui.openChat();
            if (pending.text) {
              ui.setPendingChatMessage(pending.text);
            }
          }, 500);
        } else if (pending.type === "open_detail") {
          setTimeout(() => {
            useUIStore.getState().openDetail(pending.movie);
          }, 300);
        }
      }
    } else if (status === "unauthenticated") {
      storeSignOut();
    }
  }, [status, session, storeSignIn, storeSignOut]);

  return null;
}
