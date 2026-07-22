"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { isTaskDone, isTaskOverdue, type Task } from "@/lib/types";
import { PageShell, Crumbs } from "@/components/page-shell";
import { LoadError } from "@/components/load-error";
import { TaskDialog } from "./task-dialog";
import { TaskRow } from "./task-row";
import { LoadingState, SectionLabel } from "@/components/ui-bits";

/** One bordered card holding a list of task rows. */
function TaskCard({ tasks }: { tasks: Task[] }) {
  return (
    <div className="rounded-2xl border border-border bg-card px-3 py-2 shadow-sm">
      {tasks.map((t) => (
        <TaskRow key={t.id} task={t} />
      ))}
    </div>
  );
}

/**
 * The /tasks page: the whole task list in three sections — the recurring
 * dailies, the one-off to-dos still open (overdue and dated ones first), and
 * what's already done.
 */
export function TasksView() {
  const tasks = useStore((s) => s.tasks);
  const loadStatus = useStore((s) => s.loadStatus);
  const addTask = useStore((s) => s.addTask);
  const goals = useStore((s) => s.goals);
  const [dialogOpen, setDialogOpen] = useState(false);

  const daily = tasks.filter((t) => t.daily);
  const open = tasks.filter((t) => !t.daily && !t.done);
  const completed = tasks.filter((t) => !t.daily && t.done);

  // Open to-dos: overdue first, then by nearest deadline, then store order
  // (newest first) for the undated rest.
  const sortedOpen = open
    .map((t, i) => [t, i] as const)
    .sort(([a, ai], [b, bi]) => {
      const rank = (t: Task) => (isTaskOverdue(t) ? 0 : t.dueDate !== undefined ? 1 : 2);
      return (
        rank(a) - rank(b) ||
        (a.dueDate ?? Infinity) - (b.dueDate ?? Infinity) ||
        ai - bi
      );
    })
    .map(([t]) => t);

  const dailyDone = daily.filter((t) => isTaskDone(t)).length;

  return (
    <PageShell crumbs={<Crumbs root="My Tasks" />} width="lg">
      {loadStatus === "loading" ? (
        <LoadingState label="Loading your tasks…" />
      ) : loadStatus === "error" ? (
        <LoadError />
      ) : tasks.length === 0 ? (
        <EmptyState onNewTask={() => setDialogOpen(true)} />
      ) : (
        <div className="space-y-8">
          {daily.length > 0 && (
            <section>
              <SectionLabel>
                Daily · {dailyDone}/{daily.length} today
              </SectionLabel>
              <TaskCard tasks={daily} />
            </section>
          )}

          {sortedOpen.length > 0 && (
            <section>
              <SectionLabel>To-dos · {sortedOpen.length}</SectionLabel>
              <TaskCard tasks={sortedOpen} />
            </section>
          )}

          <button
            onClick={() => setDialogOpen(true)}
            className="mx-auto flex w-full max-w-md items-center justify-center gap-2 rounded-2xl border border-dashed border-border-strong px-4 py-3.5 text-sm font-semibold text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
          >
            + New Task
          </button>

          {completed.length > 0 && (
            <section>
              <SectionLabel>Done · {completed.length}</SectionLabel>
              <TaskCard tasks={completed} />
            </section>
          )}
        </div>
      )}

      <TaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="New task"
        description="A one-off to-do or a daily habit — optionally tied to one of your goals."
        submitLabel="Add task"
        goals={goals}
        onSubmit={(title, values) => addTask(title, values)}
      />
    </PageShell>
  );
}

function EmptyState({ onNewTask }: { onNewTask: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3.5 py-24 text-center">
      <div className="mb-1.5 flex h-14 w-14 items-center justify-center rounded-full border border-dashed border-border-strong text-2xl text-muted-foreground">
        +
      </div>
      <h2 className="text-xl font-bold">No tasks yet</h2>
      <p className="max-w-sm text-sm text-muted-foreground">
        Capture the small stuff here — daily habits and one-off to-dos, on their own or tied to a
        goal.
      </p>
      <button
        onClick={onNewTask}
        className="mt-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
      >
        + Create your first task
      </button>
    </div>
  );
}
