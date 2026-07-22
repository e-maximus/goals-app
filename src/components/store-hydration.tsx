"use client";

import { useStoreHydration } from "@/hooks/use-store-hydration";
import type { ServerState } from "@/lib/sync";

/**
 * Seeds the store from the server-loaded initial state. Renders nothing —
 * mounted once in the `(app)` layout, which fetches `initialData` on the server
 * and passes it here. See {@link useStoreHydration}.
 */
export function StoreHydration({ initialData }: { initialData: ServerState | null }) {
  useStoreHydration(initialData);
  return null;
}
