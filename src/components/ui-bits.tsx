import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** A spinning loader icon. Size and color come from the parent via `className`. */
export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("animate-spin", className)} aria-hidden />;
}

/**
 * Centered loading state for a page while its data loads from the server. Fills
 * the available space so it sits where the content will land.
 */
export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div
      className="flex flex-1 flex-col items-center justify-center gap-3 py-24 text-muted-foreground"
      role="status"
    >
      <Spinner className="h-6 w-6" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function ProgressBar({
  value,
  className,
  barClassName,
}: {
  value: number;
  className?: string;
  barClassName?: string;
}) {
  return (
    <div className={cn("h-2 flex-1 overflow-hidden rounded-full bg-muted", className)}>
      <div
        className={cn("h-full rounded-full bg-primary transition-[width] duration-300", barClassName)}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3.5 flex items-center gap-2.5 text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
      <span className="whitespace-nowrap">{children}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
