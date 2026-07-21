"use client";

import { useStoreHydration } from "@/hooks/use-store-hydration";

/**
 * Kicks off the initial goals load. Renders nothing — mounted once in the root
 * layout so the fetch starts as soon as the app hydrates. See
 * {@link useStoreHydration}.
 */
export function StoreHydration() {
  useStoreHydration();
  return null;
}
