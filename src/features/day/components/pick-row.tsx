"use client";

import Link from "next/link";
import { Check, Plus, Target } from "lucide-react";
import { DueBadge } from "@/components/ui-bits";
import { cn, goalHref } from "@/lib/utils";
import type { Goal } from "@/lib/types";

/**
 * One offered row in the picker's right pane — deliberately lighter than
 * {@link TaskRow}: it doesn't toggle done. Picking is the only thing you can do
 * to something you haven't committed to yet, and a checkbox here would invite
 * finishing work from inside the planning screen.
 */
export function PickRow({
  title,
  description,
  goal,
  dueDate,
  daily,
  taken,
  onAdd,
}: {
  title: string;
  description?: string;
  /** The goal this belongs to, rendered as a chip. */
  goal?: Goal;
  dueDate?: number;
  daily?: boolean;
  /** Already in today's plan: dimmed, with the add button reading as a tick. */
  taken: boolean;
  onAdd: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-lg px-2 py-1.5 transition-opacity hover:bg-muted/60",
        taken && "opacity-50"
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-medium">{title}</span>
          {daily && (
            <span className="inline-flex flex-shrink-0 items-center rounded-full border border-border px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
              daily
            </span>
          )}
          <DueBadge dueDate={daily ? undefined : dueDate} done={false} />
          {goal && (
            <Link
              href={goalHref(goal)}
              className="inline-flex max-w-48 flex-shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
            >
              <Target className="h-3 w-3 flex-shrink-0" aria-hidden />
              <span className="truncate">{goal.title}</span>
            </Link>
          )}
        </div>
        {description && (
          <div className="mt-0.5 text-[13px] text-muted-foreground">{description}</div>
        )}
      </div>

      <button
        onClick={onAdd}
        disabled={taken}
        aria-label={taken ? `${title} — already in today` : `Add ${title} to today`}
        className={cn(
          "mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md border text-muted-foreground transition-colors",
          taken
            ? "border-transparent text-primary"
            : "border-border hover:border-primary hover:text-primary"
        )}
      >
        {taken ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}
