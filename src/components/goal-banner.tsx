import { Menu } from "@base-ui/react/menu";
import { MoreVertical, Pencil, Share2, Trash2 } from "lucide-react";
import { ProgressBar } from "@/components/ui-bits";

/**
 * The goal header card shown at the top of a goal page. Presentational: the
 * page ([goal-detail.tsx](goal-detail.tsx)) owns the data and the
 * edit/share/delete handlers, which keeps this renderable in isolation
 * (Storybook/tests).
 */
export function GoalBanner({
  title,
  why,
  pct,
  onEdit,
  onShare,
  onDelete,
}: {
  title: string;
  why?: string;
  pct: number;
  onEdit?: () => void;
  onShare?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="group/banner relative flex flex-col gap-5 rounded-2xl border border-border bg-card px-7 py-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
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

      {/* Options menu floats in the card's top-right corner, revealed on hover
          (or focus / while open) on large screens — the same pattern as the
          group card. Touch devices, which have no hover, keep it visible. */}
      <Menu.Root>
        <Menu.Trigger
          aria-label="Goal options"
          className="absolute -right-2 -top-2 flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-muted-foreground opacity-100 shadow-sm transition-opacity hover:text-foreground focus-visible:opacity-100 data-[popup-open]:opacity-100 lg:opacity-0 lg:group-hover/banner:opacity-100 data-[popup-open]:lg:opacity-100"
        >
          <MoreVertical className="h-4 w-4" />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner side="bottom" align="end" sideOffset={6} className="z-50">
            <Menu.Popup className="min-w-40 rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-md outline-none">
              <Menu.Item
                onClick={onEdit}
                className="flex cursor-default items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] outline-none data-[highlighted]:bg-muted"
              >
                <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                Edit
              </Menu.Item>
              <Menu.Item
                onClick={onShare}
                className="flex cursor-default items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] outline-none data-[highlighted]:bg-muted"
              >
                <Share2 className="h-3.5 w-3.5 text-muted-foreground" />
                Share
              </Menu.Item>
              <Menu.Item
                onClick={onDelete}
                className="flex cursor-default items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-destructive outline-none data-[highlighted]:bg-destructive/10"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </div>
  );
}
