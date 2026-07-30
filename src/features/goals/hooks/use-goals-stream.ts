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
 *   open for days. Reconnecting on return doubles as the resync — nothing is
 *   missed by having been away.
 * - **The event is a signal, not data.** It carries the server's new stamp and
 *   nothing else; {@link useStore.onRemoteChange} decides whether that means a
 *   reload (see the store's `reconcileRemote`). So there is exactly one code
 *   path that turns server state into store state.
 *
 * That resync used to be unconditional: every reconnect asked for a reload, so
 * every trip away from the tab and back re-fetched the whole store and re-rendered
 * the page under you — for a stamp that, most of the time, hadn't moved. The
 * server now opens the stream by saying where it stands (`goals-stamp`), which
 * runs through the same comparison a change event does and reloads only when
 * something actually happened while you were gone.
 */
export function useGoalsStream(): void {
  useEffect(() => {
    let source: EventSource | null = null;
    // The first connection needs no resync at all: the store was just handed the
    // server's state (hydration, or its own load), so its stamp is current by
    // construction. Later connections have a gap behind them to account for.
    let connectedBefore = false;

    const open = () => {
      if (source) return;
      const es = new EventSource("/api/goals/stream");
      source = es;

      // Whether this connection has a gap behind it. Every connection but the
      // very first does: the first opens onto state the store was just handed
      // (hydration, or its own load), so its stamp is current by construction.
      //
      // Armed here, when the connection is *created*, rather than when its stamp
      // arrives — a tab hidden again before the stamp lands would otherwise
      // forget it ever connected, and read the next reconnect as a first
      // connection with nothing to catch up on. That loses writes.
      let needsResync = connectedBefore;
      connectedBefore = true;
      let opened = false;

      es.addEventListener("open", () => {
        // EventSource reconnects on its own after a dropped network, reusing
        // this object and never running the code above. That is another gap.
        if (opened) needsResync = true;
        opened = true;
      });

      // Where the server stands, sent once per connection. On a connection with
      // a gap behind it, it answers the only question that gap raises — did
      // anything change while we were away? — and `onRemoteChange` reloads only
      // if it did. A stamp we couldn't be told (null) means assume the worst and
      // reload, which is what this did unconditionally before.
      es.addEventListener("goals-stamp", (event) => {
        if (!needsResync) return;
        needsResync = false;
        const { updatedAt } = JSON.parse((event as MessageEvent<string>).data) as {
          updatedAt: number | null;
        };
        if (updatedAt === null) useStore.getState().requestResync();
        else useStore.getState().onRemoteChange(updatedAt);
      });

      es.addEventListener("goals-changed", (event) => {
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
