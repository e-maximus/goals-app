"use client";

import { DayPicker } from "react-day-picker";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A single-month date picker: react-day-picker restyled with the app's tokens
 * (the library ships its own CSS, which we don't import — every class below is
 * ours). Kept to exactly what the due-date field needs: single selection.
 */
export function Calendar({
  selected,
  onSelect,
  className,
}: {
  selected?: Date;
  onSelect: (date: Date | undefined) => void;
  className?: string;
}) {
  return (
    <DayPicker
      mode="single"
      selected={selected}
      onSelect={onSelect}
      defaultMonth={selected}
      showOutsideDays
      className={cn("select-none", className)}
      classNames={{
        root: "relative",
        months: "flex",
        month: "space-y-2",
        nav: "absolute inset-x-1 top-0 flex items-center justify-between",
        button_previous:
          "flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        button_next:
          "flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        month_caption: "flex h-7 items-center justify-center",
        caption_label: "text-sm font-semibold",
        month_grid: "border-collapse",
        weekdays: "",
        weekday: "h-8 w-9 text-center text-xs font-medium text-muted-foreground",
        week: "",
        day: "p-0 text-center",
        day_button:
          "h-9 w-9 rounded-lg text-sm tabular-nums transition-colors hover:bg-muted aria-selected:hover:bg-primary",
        today: "font-bold text-primary",
        selected: "[&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:font-semibold",
        outside: "text-muted-foreground/50",
        disabled: "opacity-40",
        hidden: "invisible",
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === "left" ? (
            <ChevronLeft className="h-4 w-4" aria-hidden />
          ) : (
            <ChevronRight className="h-4 w-4" aria-hidden />
          ),
      }}
    />
  );
}
