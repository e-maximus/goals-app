import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui-bits";

/**
 * The goal header card shown at the top of a goal page. Presentational: the
 * page ([goal-detail.tsx](goal-detail.tsx)) owns the data and the edit/delete
 * handlers, which keeps this renderable in isolation (Storybook/tests).
 */
export function GoalBanner({
  title,
  why,
  pct,
  onEdit,
  onDelete,
}: {
  title: string;
  why?: string;
  pct: number;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-border bg-card px-7 py-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Goal
        </div>
        <h1 className="text-2xl font-bold">{title}</h1>
        {why && <p className="mt-2 max-w-xl text-sm text-muted-foreground">{why}</p>}
      </div>
      <div className="flex w-full items-center gap-4 sm:w-[260px] sm:flex-shrink-0">
        <ProgressBar value={pct} className="h-2.5" />
        <span className="tabular-nums text-xl font-bold text-primary">{pct}%</span>
      </div>
      <div className="flex flex-shrink-0 items-center gap-2.5">
        <Button variant="outline" size="sm" onClick={onEdit}>
          <Pencil className="mr-1.5 h-3.5 w-3.5" />
          Edit
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onDelete}
          className="border-destructive text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
          Delete
        </Button>
      </div>
    </div>
  );
}
