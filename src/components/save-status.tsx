"use client";

import { cn } from "@/lib/utils";
import type { SaveStatus as SaveStatusValue } from "@/lib/store";

/**
 * A quiet indicator that changes are reaching the server. Silent while saved —
 * the common case — and only speaks up while a save is in flight or after one
 * failed, so the header stays calm until there's something to say.
 */
export function SaveStatus({ status }: { status: SaveStatusValue }) {
  if (status === "saved") return null;

  return (
    <span
      className={cn(
        "flex items-center gap-1.5 text-xs",
        status === "error" ? "text-destructive" : "text-muted-foreground"
      )}
      role="status"
    >
      <span
        className={cn(
          "h-2 w-2 rounded-full",
          status === "saving" ? "animate-pulse bg-muted-foreground" : "bg-destructive"
        )}
      />
      {status === "saving" ? "Saving…" : "Save failed"}
    </span>
  );
}
