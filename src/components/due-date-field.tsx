"use client";

import { useState } from "react";
import { CalendarDays, X } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { formatDueDate } from "@/lib/types";

/** Epoch ms of UTC midnight for a calendar day picked in the local timezone. */
function toUtcMidnight(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

/** The picked day as a local Date, for feeding back into the calendar. */
function toLocalDate(dueDate: number): Date {
  const d = new Date(dueDate);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * The one due-date input, shared by the goal, group and step dialogs: a
 * labelled trigger showing the current deadline (or "Set due date"), a
 * calendar in a popover, and an inline clear. Value is epoch ms of UTC
 * midnight, `undefined` for none — matching `dueDate` across the domain.
 */
export function DueDateField({
  value,
  onChange,
}: {
  value: number | undefined;
  onChange: (dueDate: number | undefined) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="grid gap-2">
      <Label>Due date (optional)</Label>
      <div className="flex items-center gap-1.5">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            aria-label="Due date"
            className="flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm transition-colors hover:bg-muted"
          >
            <CalendarDays className="h-4 w-4 text-muted-foreground" aria-hidden />
            {value !== undefined ? (
              <span className="font-medium">{formatDueDate(value)}</span>
            ) : (
              <span className="text-muted-foreground">Set due date</span>
            )}
          </PopoverTrigger>
          <PopoverContent>
            <Calendar
              selected={value !== undefined ? toLocalDate(value) : undefined}
              onSelect={(date) => {
                onChange(date ? toUtcMidnight(date) : undefined);
                setOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>
        {value !== undefined && (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            aria-label="Clear due date"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
