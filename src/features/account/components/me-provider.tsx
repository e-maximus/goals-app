"use client";

import { createContext, useContext, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { syncIdentity } from "../actions";
import type { Me } from "../types";

const MeContext = createContext<Me | null>(null);

/**
 * Makes the server-resolved identity available to the client components that
 * show it. Rendered by the layouts, which load it on the server — no component
 * fetches it, so the chip, the greeting and the Settings card can never
 * disagree about who you are.
 *
 * The one thing that *changes* the answer is Clerk sign-in, which happens in a
 * modal rather than a navigation and switches which account the server
 * resolves. That's the single case where the identity is settled from the
 * client: {@link syncIdentity} links the account and answers with the new
 * identity, and a refresh re-renders the tree the server already owns.
 */
export function MeProvider({ me, children }: { me: Me | null; children: React.ReactNode }) {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const lastSignedIn = useRef<boolean | null>(null);

  useEffect(() => {
    if (!isLoaded) return;
    const previous = lastSignedIn.current;
    lastSignedIn.current = isSignedIn;
    // Skip the first settled reading — it describes the render we already have.
    if (previous === null || previous === isSignedIn) return;
    // Link the account, then let the server re-render this tree with the
    // identity it now resolves. The value below stays the server's either way —
    // there is one source for it, not two.
    void syncIdentity().then(
      () => router.refresh(),
      () => {} // the chip falls back to the Clerk profile; nothing to recover
    );
  }, [isLoaded, isSignedIn, router]);

  return <MeContext.Provider value={me}>{children}</MeContext.Provider>;
}

/** The current identity, or null while it's unknown (no session, or a failed load). */
export function useMe(): Me | null {
  return useContext(MeContext);
}
