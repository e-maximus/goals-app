"use client";

import { useGoalsStream } from "../hooks/use-goals-stream";

/**
 * Mounts the goals event stream. Renders nothing, and belongs in the `(app)`
 * layout beside {@link StoreHydration} — one connection per tab, not one per
 * view that happens to read the store.
 */
export function GoalsStream() {
  useGoalsStream();
  return null;
}
