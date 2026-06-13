"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useAccountStore } from "@/lib/account-store";

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
      storeSignIn(session.user.email);
    } else if (status === "unauthenticated") {
      storeSignOut();
    }
  }, [status, session, storeSignIn, storeSignOut]);

  return null;
}
