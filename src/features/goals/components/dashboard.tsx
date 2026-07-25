"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { goalStatus, isGoalComplete, todayTasks } from "@/lib/types";
import { PageShell } from "@/components/layout/page-shell";
import { LoadError } from "@/components/load-error";
import { TaskRow } from "@/features/tasks";
import { NewGoalDialog } from "./new-goal-dialog";
import { CompletedRow, GoalRow, PausedRow } from "./goal-rows";
import { LoadingState, SectionLabel } from "@/components/ui-bits";
import { goalHref } from "@/lib/utils";

/**
 * The dashboard's compact task strip: every daily task plus anything due today
 * or overdue, checkable in place. The full list lives on /tasks.
 */
function TodaySection() {
  const tasks = useStore((s) => s.tasks);
  const today = todayTasks(tasks);
  if (today.length === 0) return null;

  return (
    <section>
      <SectionLabel
        action={
          <Link
            href="/tasks"
            className="font-semibold normal-case tracking-normal text-muted-foreground transition-colors hover:text-foreground"
          >
            All tasks →
          </Link>
        }
      >
        Today
      </SectionLabel>
      <div className="rounded-2xl border border-border bg-card px-3 py-2 shadow-sm">
        {today.map((t) => (
          <TaskRow key={t.id} task={t} />
        ))}
      </div>
    </section>
  );
}

export function Dashboard() {
  const goals = useStore((s) => s.goals);
  const loadStatus = useStore((s) => s.loadStatus);
  const addGoal = useStore((s) => s.addGoal);
  const [dialogOpen, setDialogOpen] = useState(false);
  const router = useRouter();

  const completed = goals.filter(isGoalComplete);
  const paused = goals.filter((g) => !isGoalComplete(g) && goalStatus(g) === "paused");
  const inProgress = goals.filter((g) => !isGoalComplete(g) && goalStatus(g) === "active");

  const handleCreate = (title: string, why?: string) => {
    const goal = addGoal(title, why);
    router.push(goalHref(goal));
  };

  return (
    <PageShell width="lg">
      {loadStatus === "loading" ? (
        <LoadingState label="Loading your goals…" />
      ) : loadStatus === "error" ? (
        <LoadError />
      ) : goals.length === 0 ? (
        <div className="space-y-8">
          <TodaySection />
          <EmptyState onNewGoal={() => setDialogOpen(true)} />
        </div>
      ) : (
        <div className="space-y-8">
          <TodaySection />
          {inProgress.length > 0 && (
            <section>
              <SectionLabel>In progress · {inProgress.length}</SectionLabel>
              <div className="flex flex-col gap-3.5">
                {inProgress.map((g, i) => (
                  <GoalRow
                    key={g.id}
                    goal={g}
                    prevId={inProgress[i - 1]?.id}
                    nextId={inProgress[i + 1]?.id}
                  />
                ))}
              </div>
            </section>
          )}

          <button
            onClick={() => setDialogOpen(true)}
            className="mx-auto flex w-full max-w-md items-center justify-center gap-2 rounded-2xl border border-dashed border-border-strong px-4 py-3.5 text-sm font-semibold text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
          >
            + New Goal
          </button>

          {paused.length > 0 && (
            <section>
              <SectionLabel>Paused · {paused.length}</SectionLabel>
              <div className="flex flex-col gap-2.5">
                {paused.map((g, i) => (
                  <PausedRow
                    key={g.id}
                    goal={g}
                    prevId={paused[i - 1]?.id}
                    nextId={paused[i + 1]?.id}
                  />
                ))}
              </div>
            </section>
          )}

          {completed.length > 0 && (
            <section>
              <SectionLabel>Completed · {completed.length}</SectionLabel>
              <div className="flex flex-col gap-2.5">
                {completed.map((g, i) => (
                  <CompletedRow
                    key={g.id}
                    goal={g}
                    prevId={completed[i - 1]?.id}
                    nextId={completed[i + 1]?.id}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      <NewGoalDialog open={dialogOpen} onOpenChange={setDialogOpen} onCreate={handleCreate} />
    </PageShell>
  );
}

function EmptyState({ onNewGoal }: { onNewGoal: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3.5 py-24 text-center">
      <div className="mb-1.5 flex h-14 w-14 items-center justify-center rounded-full border border-dashed border-border-strong text-2xl text-muted-foreground">
        +
      </div>
      <h2 className="text-xl font-bold">No goals yet</h2>
      <p className="max-w-sm text-sm text-muted-foreground">
        Turn something big and vague into a goal you can actually make progress on — one small
        step at a time.
      </p>
      <button
        onClick={onNewGoal}
        className="mt-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
      >
        + Create your first goal
      </button>
    </div>
  );
}
