"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useStore } from "@/lib/store";
import {
  commentCount,
  goalProgress,
  goalStepCounts,
  isGoalComplete,
  type Goal,
} from "@/lib/types";
import { Topbar, Crumbs } from "@/components/topbar";
import { NewGoalDialog } from "@/components/new-goal-dialog";
import { ProgressBar, SectionLabel } from "@/components/ui-bits";
import { cn } from "@/lib/utils";

function goalMeta(goal: Goal): string {
  const { total } = goalStepCounts(goal);
  const comments = commentCount(goal);
  const segments: string[] = [];

  if (goal.groups.length === 0) {
    segments.push("No groups yet");
  } else {
    const groupWord = goal.groups.length === 1 ? "group" : "groups";
    const stepWord = total === 1 ? "step" : "steps";
    segments.push(`${goal.groups.length} ${groupWord}`, `${total} ${stepWord}`);
  }

  if (comments > 0) {
    segments.push(`${comments} ${comments === 1 ? "comment" : "comments"}`);
  }

  return segments.join(" · ");
}

function statusLabel(goal: Goal): { text: string; complete: boolean } {
  if (isGoalComplete(goal)) return { text: "Done", complete: true };
  const { total } = goalStepCounts(goal);
  if (goal.groups.length === 0 || total === 0) return { text: "Just started", complete: false };
  return { text: "Active", complete: false };
}

function GoalRow({ goal }: { goal: Goal }) {
  const pct = goalProgress(goal);
  const status = statusLabel(goal);
  const complete = isGoalComplete(goal);

  return (
    <Link
      href={`/goal?id=${goal.id}`}
      className={cn(
        "flex items-center gap-4 rounded-2xl border border-border bg-card px-6 py-4 shadow-sm transition-colors hover:border-primary/50 sm:gap-6",
        complete && "border-primary/60 bg-secondary/60"
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-base font-bold">{goal.title}</div>
        <div className="text-[13px] text-muted-foreground">{goalMeta(goal)}</div>
      </div>
      <div className="hidden w-[220px] flex-shrink-0 items-center gap-3 sm:flex">
        <ProgressBar value={pct} />
        <span className="tabular-nums text-[15px] font-bold text-primary">{pct}%</span>
      </div>
      <span
        className={cn(
          "flex-shrink-0 rounded-full bg-muted px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground",
          status.complete && "bg-primary text-primary-foreground"
        )}
      >
        {status.text}
      </span>
    </Link>
  );
}

export function Dashboard() {
  const goals = useStore((s) => s.goals);
  const hydrated = useStore((s) => s.hydrated);
  const addGoal = useStore((s) => s.addGoal);
  const [dialogOpen, setDialogOpen] = useState(false);
  const router = useRouter();

  const inProgress = goals.filter((g) => !isGoalComplete(g));
  const completed = goals.filter((g) => isGoalComplete(g));

  const handleCreate = (title: string, why?: string) => {
    const goal = addGoal(title, why);
    router.push(`/goal?id=${goal.id}`);
  };

  return (
    <div className="flex flex-1 flex-col">
      <Topbar crumbs={<Crumbs />} onNewGoal={() => setDialogOpen(true)} />

      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-8 sm:px-10">
        {!hydrated ? null : goals.length === 0 ? (
          <EmptyState onNewGoal={() => setDialogOpen(true)} />
        ) : (
          <div className="space-y-8">
            {inProgress.length > 0 && (
              <section>
                <SectionLabel>In progress · {inProgress.length}</SectionLabel>
                <div className="flex flex-col gap-3.5">
                  {inProgress.map((g) => (
                    <GoalRow key={g.id} goal={g} />
                  ))}
                </div>
              </section>
            )}

            {completed.length > 0 && (
              <section>
                <SectionLabel>Completed · {completed.length}</SectionLabel>
                <div className="flex flex-col gap-3.5">
                  {completed.map((g) => (
                    <GoalRow key={g.id} goal={g} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </main>

      <NewGoalDialog open={dialogOpen} onOpenChange={setDialogOpen} onCreate={handleCreate} />
    </div>
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
