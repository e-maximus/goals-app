"use client";

import { useEffect } from "react";
import { useStore } from "@/lib/store";

/**
 * Keeps a Server-Sent Events connection to `/api/goals/stream` open while the
 * tab is on screen, so an edit made in another tab, in the AI chat, or by an
 * agent over MCP shows up here without a refresh.
 *
 * Two deliberate choices:
 *
 * - **Only while visible.** A backgrounded tab costs the server a socket and a
 *   subscription to deliver events nobody is looking at, and people leave tabs
 *   open for days. Reconnecting on return doubles as the resync, since the store
 *   reloads wholesale anyway — nothing is missed by having been away.
 * - **The event is a signal, not data.** It carries the server's new stamp and
 *   nothing else; {@link useStore.onRemoteChange} decides whether that means a
 *   reload (see the store's `reconcileRemote`). So there is exactly one code
 *   path that turns server state into store state.
 */
export function useGoalsStream(): void {
  useEffect(() => {
    let source: EventSource | null = null;
    // The first connection needs no resync: the store was just handed the
    // server's state (hydration, or its own load). Every connection after it
    // does — a write during the gap was announced to nobody.
    let connectedBefore = false;

    const open = () => {
      if (source) return;
      source = new EventSource("/api/goals/stream");

      source.addEventListener("open", () => {
        if (connectedBefore) useStore.getState().requestResync();
        connectedBefore = true;
      });

      source.addEventListener("goals-changed", (event) => {
        const { updatedAt } = JSON.parse((event as MessageEvent<string>).data) as {
          updatedAt: number;
        };
        useStore.getState().onRemoteChange(updatedAt);
      });
    };

    const close = () => {
      source?.close();
      source = null;
    };

    const sync = () => (document.visibilityState === "visible" ? open() : close());

    sync();
    document.addEventListener("visibilitychange", sync);
    // A page going into the back/forward cache fires `pagehide`, not
    // `visibilitychange`, and would otherwise leave a half-dead socket behind.
    window.addEventListener("pagehide", close);
    window.addEventListener("pageshow", sync);

    return () => {
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("pagehide", close);
      window.removeEventListener("pageshow", sync);
      close();
    };
  }, []);
}
