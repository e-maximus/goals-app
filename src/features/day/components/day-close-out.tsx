"use client";

import { useStore } from "@/lib/store";
import { isTaskDone, utcMidnight, type Task } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui-bits";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How the day closes out: what got done, and the one action the plan owes the
 * user — moving what didn't happen to tomorrow. That move is deliberately
 * manual. Nothing rolls over on its own; a planner that silently reschedules is
 * a planner whose plan means nothing.
 */
export function DayCloseOut({ planned }: { planned: Task[] }) {
  const planTask = useStore((s) => s.planTask);

  const done = planned.filter((t) => isTaskDone(t));
  const left = planned.filter((t) => !isTaskDone(t));
  const pct = planned.length === 0 ? 0 : Math.round((done.length / planned.length) * 100);
  const tomorrow = utcMidnight() + DAY_MS;

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <ProgressBar value={pct} className="mb-3" />
      <p className="font-semibold">
        {done.length} of {planned.length} done.
      </p>
      {left.length === 0 ? (
        <p className="mt-1 text-sm text-muted-foreground">
          That&apos;s the whole day. Nothing left to carry.
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted-foreground">
            {left.length === 1 ? (
              <>
                One thing didn&apos;t happen: <em>{left[0]!.title}</em>.
              </>
            ) : (
              <>{left.length} things haven&apos;t happened yet.</>
            )}
          </p>
          {/* One button for the whole remainder rather than one per row: the
              choice being made is "carry the rest", and anything finer belongs
              to tomorrow's picker, where the day gets decided properly. */}
          <div className="mt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => left.forEach((task) => planTask(task.id, tomorrow))}
            >
              {left.length === 1 ? "Move it to tomorrow" : "Move them to tomorrow"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
