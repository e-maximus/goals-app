"use client";

import { useEffect, useRef } from "react";
import { useStore } from "@/lib/store";
import type { ServerState } from "@/lib/types";

/**
 * Seeds the client store from state the server already loaded. Renders nothing
 * — it is mounted once in the `(app)` layout, which fetches `initialData` on
 * the server and passes it here, so there is no client round-trip for the
 * initial data.
 *
 * The store is a module singleton shared across requests on the server, so it
 * is seeded in an effect (client-only) rather than during render, which also
 * keeps the first client render matching the server markup.
 *
 * `initialData` is null when the server couldn't load the store — no session on
 * that request, or a database that didn't answer. That falls back to the
 * client's own load, which ends in the store's retryable error state rather
 * than an error page.
 */
export function StoreHydration({ initialData }: { initialData: ServerState | null }) {
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (initialData) useStore.getState().hydrate(initialData);
    else void useStore.getState().load();
  }, [initialData]);

  return null;
}
