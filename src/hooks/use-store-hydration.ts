"use client";

import { useEffect, useRef } from "react";
import { useStore } from "@/lib/store";
import type { ServerState } from "@/lib/sync";

/**
 * Seed the client store from state the server already loaded.
 *
 * The goals are fetched on the server now (the `(app)` layout awaits
 * `loadInitialState`) and handed down as `initialData`; this just applies them
 * to the global store — no client fetch. The store is a module singleton shared
 * across requests on the server, so we seed it in an effect (client-only) rather
 * than during render, which also keeps the first client render matching the
 * server markup.
 *
 * `initialData` is null only for a brand-new visitor the server couldn't resolve
 * (no session cookie yet). That case falls back to the client `load`, which also
 * mints the account and sets the cookie.
 */
export function useStoreHydration(initialData: ServerState | null): void {
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (initialData) useStore.getState().hydrate(initialData);
    else void useStore.getState().load();
  }, [initialData]);
}
