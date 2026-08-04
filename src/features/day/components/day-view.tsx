"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import {
  dayList,
  isDaySettled,
  plannedTasks,
  utcMidnight,
  type Task,
} from "@/lib/types";
import { PageShell } from "@/components/layout/page-shell";
import { LoadError } from "@/components/load-error";
import { LoadingState } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { TaskRow } from "@/features/tasks";
import { DayCloseOut } from "./day-close-out";
import { DayPicker } from "./day-picker";

/** "Tuesday, 4 August", read in UTC — the day is a UTC midnight. */
function formatDay(day: number): string {
  return new Date(day).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

/**
 * The /today screen. Once a day it is the planning ritual; for the rest of the
 * day it collapses to the quiet list the user committed to and doesn't re-edit
 * — with a link back into the picker, because a plan you can't revise is a
 * cage rather than a decision.
 */
export function DayView() {
  const tasks = useStore((s) => s.tasks);
  const dayPlannedOn = useStore((s) => s.dayPlannedOn);
  const loadStatus = useStore((s) => s.loadStatus);
  const [adjusting, setAdjusting] = useState(false);

  if (loadStatus === "loading") {
    return (
      <PageShell width="lg">
        <LoadingState label="Loading your day…" />
      </PageShell>
    );
  }
  if (loadStatus === "error") {
    return (
      <PageShell width="lg">
        <LoadError />
      </PageShell>
    );
  }

  const day = utcMidnight();
  const settled = isDaySettled(dayPlannedOn);
  const planned = plannedTasks(tasks);

  if (!settled || adjusting) {
    return (
      <PageShell width="lg">
        <DayPicker
          day={day}
          // Adjusting starts from what was committed; a fresh morning starts
          // with the dailies, which are in the day unless taken out.
          initialSelection={
            settled ? planned.map((t) => t.id) : tasks.filter((t) => t.daily).map((t) => t.id)
          }
          onDone={() => setAdjusting(false)}
        />
      </PageShell>
    );
  }

  const list = dayList(tasks, dayPlannedOn);

  return (
    <PageShell width="md">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Today</h1>
          <p className="mt-1 text-sm text-muted-foreground">{formatDay(day)}</p>
        </div>

        {planned.length === 0 && <NoPlan />}

        {list.length > 0 ? (
          <TaskCard tasks={list} />
        ) : (
          <p className="rounded-2xl border border-dashed border-border-strong px-4 py-8 text-center text-sm text-muted-foreground">
            Nothing on today. Enjoy it, or bring something in.
          </p>
        )}

        {planned.length > 0 && <DayCloseOut planned={planned} />}

        <div>
          <Button variant="outline" size="sm" onClick={() => setAdjusting(true)}>
            Adjust today
          </Button>
        </div>
      </div>
    </PageShell>
  );
}

function TaskCard({ tasks }: { tasks: Task[] }) {
  return (
    <div className="rounded-2xl border border-border bg-card px-3 py-2 shadow-sm">
      {tasks.map((t) => (
        <TaskRow key={t.id} task={t} />
      ))}
    </div>
  );
}

/** Committing to nothing is a valid morning — say so, and show what still applies. */
function NoPlan() {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <p className="font-semibold">No plan today.</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Dailies still show up. Nothing else will nag you.
      </p>
    </div>
  );
}
