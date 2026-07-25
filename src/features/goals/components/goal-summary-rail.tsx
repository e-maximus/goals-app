"use client";

import { Menu } from "@base-ui/react/menu";
import { MoreVertical, Pencil, Share2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DueBadge,
  menuItemClass,
  menuItemDestructiveClass,
  menuPopupClass,
} from "@/components/ui-bits";

/**
 * The goal's header rail: the progress ring, the headline numbers, and the
 * options menu that acts on the goal as a whole.
 */

function ProgressRing({ pct }: { pct: number }) {
  const value = Math.max(0, Math.min(100, pct));
  return (
    <div
      className="relative h-16 w-16 flex-none rounded-full"
      style={{ background: `conic-gradient(var(--primary) ${value}%, var(--muted) 0)` }}
      role="img"
      aria-label={`${value}% complete`}
    >
      <div className="absolute inset-[7px] flex items-center justify-center rounded-full bg-card text-sm font-bold tabular-nums text-primary">
        {value}%
      </div>
    </div>
  );
}

/** Edit / Share / Delete for the goal, floating in the summary card's corner. */
function GoalOptionsMenu({
  onEdit,
  onShare,
  onDelete,
}: {
  onEdit: () => void;
  onShare: () => void;
  onDelete: () => void;
}) {
  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label="Goal options"
        className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:opacity-100 data-[popup-open]:bg-muted"
      >
        <MoreVertical className="h-4 w-4" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="bottom" align="end" sideOffset={6} className="z-50">
          <Menu.Popup className={menuPopupClass}>
            <Menu.Item onClick={onEdit} className={menuItemClass}>
              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
              Edit
            </Menu.Item>
            <Menu.Item onClick={onShare} className={menuItemClass}>
              <Share2 className="h-3.5 w-3.5 text-muted-foreground" />
              Share
            </Menu.Item>
            <Menu.Item onClick={onDelete} className={menuItemDestructiveClass}>
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

/**
 * The goal's summary, pinned in the right rail: title, why it matters, a
 * progress ring, and the single next step with a one-tap "Mark done". It owns
 * the goal-level actions (edit / share / delete) via the corner menu.
 */
export function GoalSummaryRail({
  title,
  why,
  dueDate,
  pct,
  done,
  total,
  complete,
  next,
  onMarkNextDone,
  onEdit,
  onShare,
  onDelete,
}: {
  title: string;
  why?: string;
  dueDate?: number;
  pct: number;
  done: number;
  total: number;
  complete: boolean;
  next: string | null;
  onMarkNextDone: () => void;
  onEdit: () => void;
  onShare: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="relative flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <GoalOptionsMenu onEdit={onEdit} onShare={onShare} onDelete={onDelete} />

      <div className="pr-8">
        <div className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
          Goal
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-bold leading-tight">{title}</h1>
          <DueBadge dueDate={dueDate} done={complete} />
        </div>
        {why && (
          <p className="mt-1.5 whitespace-pre-line text-[12.5px] leading-relaxed text-muted-foreground">
            {why}
          </p>
        )}
      </div>

      <div className="flex items-center gap-3.5">
        <ProgressRing pct={pct} />
        <div className="text-[12.5px] leading-relaxed text-muted-foreground">
          <b className="font-semibold text-foreground">
            {done} of {total}
          </b>{" "}
          {total === 1 ? "step" : "steps"} done
          <br />
          {complete
            ? "All done — nice work."
            : total === 0
              ? "Add a step to begin."
              : `Keep going — ${total - done} to go.`}
        </div>
      </div>

      {next && (
        <div className="rounded-xl bg-secondary/60 p-3 ring-1 ring-inset ring-primary/15">
          <div className="mb-1 text-[10.5px] font-bold uppercase tracking-[0.08em] text-secondary-foreground">
            Next step
          </div>
          <div className="text-[13px] font-semibold">{next}</div>
          <Button size="sm" className="mt-2.5 w-full" onClick={onMarkNextDone}>
            Mark done
          </Button>
        </div>
      )}
    </div>
  );
}
