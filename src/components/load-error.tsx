"use client";

import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";

/**
 * Shown when the goals couldn't be loaded from the server. The goals live on the
 * server now, so a failed fetch is a dead end rather than a fall back to a local
 * copy — offer a retry and say plainly what went wrong.
 */
export function LoadError() {
  const load = useStore((s) => s.load);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-24 text-center">
      <h2 className="text-xl font-bold">Couldn&apos;t load your goals</h2>
      <p className="text-sm text-muted-foreground">
        The server didn&apos;t respond. Check your connection and try again.
      </p>
      <Button variant="outline" onClick={() => void load()}>
        Retry
      </Button>
    </div>
  );
}
