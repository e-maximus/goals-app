"use client";

import { useCallback, useState } from "react";
import { Check, Copy } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** The small shared pieces the Settings cards are built from. */

/** A small green-tinted benefit pill with a leading icon. */
export function Pill({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary/60 px-2.5 py-1 text-xs font-medium text-secondary-foreground ring-1 ring-primary/15">
      <Icon className="h-3 w-3" aria-hidden />
      {children}
    </span>
  );
}

/** The amber "Guest" chip that marks a temporary, cookie-scoped identity. */
export function GuestBadge() {
  return (
    <span className="rounded-md bg-warning/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-warning-foreground">
      Guest
    </span>
  );
}

export function Divider() {
  return <div className="h-px bg-border" />;
}

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">{children}</p>
  );
}

/** Copy `value` to the clipboard, flipping to a check for a moment afterwards. */
function useCopy(value: string): { copied: boolean; copy: () => Promise<void> } {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy to clipboard");
    }
  }, [value]);
  return { copied, copy };
}

/** A standalone copy button for the guest id: copies, then flips to a check. */
export function CopyIdButton({ value }: { value: string }) {
  const { copied, copy } = useCopy(value);
  return (
    <Button variant="outline" size="sm" onClick={copy} className="flex-none">
      {copied ? <Check /> : <Copy />}
      Copy ID
    </Button>
  );
}

/** A read-only value with a copy button, and optional masking / trailing control. */
export function CopyRow({
  value,
  masked = false,
  mono = false,
  trailing,
}: {
  value: string;
  masked?: boolean;
  mono?: boolean;
  trailing?: React.ReactNode;
}) {
  const { copied, copy } = useCopy(value);
  const display = masked ? "•".repeat(Math.min(value.length, 44)) : value;

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
      <code className={`min-w-0 flex-1 truncate text-xs ${mono ? "font-mono" : ""}`}>{display}</code>
      {trailing}
      <Button variant="ghost" size="icon-sm" onClick={copy} aria-label="Copy">
        {copied ? <Check /> : <Copy />}
      </Button>
    </div>
  );
}
