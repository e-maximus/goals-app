"use client";

import { useEffect } from "react";
import { useStore } from "@/lib/store";

/**
 * Load the goals from the server once, after the client mounts. The store is
 * global, so consumers just call {@link useStore}; this only kicks off the
 * initial fetch.
 *
 * The load runs on the client rather than during render because the goals come
 * from the server at request time — there is nothing to prerender into the
 * static markup, and fetching in an effect keeps server and client markup in
 * sync on first paint.
 */
export function useStoreHydration(): void {
  useEffect(() => {
    void useStore.getState().load();
  }, []);
}
