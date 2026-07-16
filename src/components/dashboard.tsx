"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, Pause, Play } from "lucide-react";
import { useStore } from "@/lib/store";
import {
  noteCount,
  goalProgress,
  goalStepCounts,
  goalStatus,
  isGoalComplete,
  isGoalStale,
  daysSinceActivity,
  nextStep,
  completedIn,
  type Goal,
} from "@/lib/types";
import { Topbar, Crumbs } from "@/components/topbar";
import { LoadError } from "@/components/load-error";
import { NewGoalDialog } from "@/components/new-goal-dialog";
import { Button } from "@/components/ui/button";
import { DueBadge, LoadingState, ProgressBar, SectionLabel } from "@/components/ui-bits";
import { cn } from "@/lib/utils";

function goalMeta(goal: Goal): string {
  const notes = noteCount(goal);
  const segments: string[] = [];

  if (goal.groups.length > 0) {
    const groupWord = goal.groups.length === 1 ? "group" : "groups";
    segments.push(`${goal.groups.length} ${groupWord}`);
  }

  if (notes > 0) {
    segments.push(`${notes} ${notes === 1 ? "note" : "notes"}`);
  }

  segments.push(activityLabel(goal));

  return segments.join(" · ");
}

function activityLabel(goal: Goal): string {
  const days = daysSinceActivity(goal);
  if (days === 0) return "active today";
  if (days === 1) return "active yesterday";
  return `active ${days} days ago`;
}

/** "Jun 30" — the short date used by the compact paused row. */
function shortDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * An in-progress goal card. The whole card navigates via a stretched title
 * link (an `after:` overlay), so the inline actions — Done / Pause / Break it
 * down — can be real buttons layered above it rather than nested inside a Link.
 */
function GoalRow({ goal }: { goal: Goal }) {
  const toggleStep = useStore((s) => s.toggleStep);
  const setGoalStatus = useStore((s) => s.setGoalStatus);
  const router = useRouter();

  const pct = goalProgress(goal);
  const { done, total } = goalStepCounts(goal);
  const stale = isGoalStale(goal);
  const next = nextStep(goal);

  return (
    <div
      className={cn(
        "group/goal relative rounded-2xl border border-border bg-card px-6 py-4 shadow-sm transition-colors hover:border-primary/50",
        stale && "border-warning/60 hover:border-warning"
      )}
    >
      <div className="flex items-start justify-between gap-4 sm:gap-6">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <Link
              href={`/goal/${goal.id}`}
              className="min-w-0 text-base font-bold after:absolute after:inset-0 after:rounded-2xl"
            >
              <span className="block truncate">{goal.title}</span>
            </Link>
            <DueBadge dueDate={goal.dueDate} done={false} />
          </div>
          {stale ? (
            <div className="mt-1 flex items-center gap-2">
              <span className="rounded-full bg-warning/15 px-2.5 py-0.5 text-[11px] font-semibold text-warning-foreground">
                {daysSinceActivity(goal)} days without activity
              </span>
            </div>
          ) : (
            <div className="text-[13px] text-muted-foreground">{goalMeta(goal)}</div>
          )}
        </div>
        <div className="flex flex-shrink-0 items-center gap-3">
          {total > 0 && (
            <div className="hidden w-[190px] items-center gap-3 sm:flex">
              <ProgressBar value={pct} />
              <span className="whitespace-nowrap text-[13px] font-semibold tabular-nums">
                {done} of {total} steps
              </span>
            </div>
          )}
          {stale && (
            <Button
              variant="outline"
              size="sm"
              className="relative z-10"
              onClick={() => setGoalStatus(goal.id, "paused")}
            >
              <Pause data-icon="inline-start" /> Pause
            </Button>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-muted/50 px-3.5 py-2">
        {next ? (
          <>
            <span className="min-w-0 truncate text-[13px] text-muted-foreground">
              Next: <span className="font-medium text-foreground">{next.step.text}</span>
              {next.group ? ` · ${next.group.title}` : ""}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="relative z-10 flex-shrink-0"
              onClick={() => toggleStep(goal.id, next.group?.id ?? null, next.step.id)}
            >
              Done <Check data-icon="inline-end" />
            </Button>
          </>
        ) : (
          <>
            <span className="min-w-0 truncate text-[13px] text-muted-foreground">
              No steps yet — break this goal down to get moving
            </span>
            <Button
              variant="outline"
              size="sm"
              className="relative z-10 flex-shrink-0"
              onClick={() => router.push(`/goal/${goal.id}`)}
            >
              Break it down
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

/** A paused goal, collapsed to one line to keep the in-progress list honest. */
function PausedRow({ goal }: { goal: Goal }) {
  const setGoalStatus = useStore((s) => s.setGoalStatus);
  const { done, total } = goalStepCounts(goal);

  return (
    <div className="relative flex items-center justify-between gap-4 rounded-xl border border-border bg-card px-6 py-2.5">
      <Link
        href={`/goal/${goal.id}`}
        className="flex min-w-0 items-center gap-2 text-sm font-medium text-muted-foreground after:absolute after:inset-0 after:rounded-xl"
      >
        <Pause className="h-3.5 w-3.5 flex-shrink-0" aria-hidden />
        <span className="truncate">{goal.title}</span>
      </Link>
      <div className="flex flex-shrink-0 items-center gap-3">
        <span className="whitespace-nowrap text-xs text-muted-foreground">
          {done} of {total}
          {goal.pausedAt ? ` · paused ${shortDate(goal.pausedAt)}` : ""}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="relative z-10"
          onClick={() => setGoalStatus(goal.id, "active")}
        >
          <Play data-icon="inline-start" /> Resume
        </Button>
      </div>
    </div>
  );
}

/** A finished goal, collapsed to one line with a small reward instead of 100%. */
function CompletedRow({ goal }: { goal: Goal }) {
  const { total } = goalStepCounts(goal);

  return (
    <div className="relative flex items-center justify-between gap-4 rounded-xl border border-primary/40 bg-secondary/60 px-6 py-2.5">
      <Link
        href={`/goal/${goal.id}`}
        className="flex min-w-0 items-center gap-2 text-sm font-medium after:absolute after:inset-0 after:rounded-xl"
      >
        <Check className="h-4 w-4 flex-shrink-0 text-primary" aria-hidden />
        <span className="truncate">{goal.title}</span>
      </Link>
      <span className="flex-shrink-0 whitespace-nowrap text-xs text-muted-foreground">
        {total} {total === 1 ? "step" : "steps"} · finished {completedIn(goal)}
      </span>
    </div>
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
    router.push(`/goal/${goal.id}`);
  };

  return (
    <div className="flex flex-1 flex-col">
      <Topbar crumbs={<Crumbs />} onNewGoal={() => setDialogOpen(true)} />

      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-8 sm:px-10">
        {loadStatus === "loading" ? (
          <LoadingState label="Loading your goals…" />
        ) : loadStatus === "error" ? (
          <LoadError />
        ) : goals.length === 0 ? (
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

            {paused.length > 0 && (
              <section>
                <SectionLabel>Paused · {paused.length}</SectionLabel>
                <div className="flex flex-col gap-2.5">
                  {paused.map((g) => (
                    <PausedRow key={g.id} goal={g} />
                  ))}
                </div>
              </section>
            )}

            {completed.length > 0 && (
              <section>
                <SectionLabel>Completed · {completed.length}</SectionLabel>
                <div className="flex flex-col gap-2.5">
                  {completed.map((g) => (
                    <CompletedRow key={g.id} goal={g} />
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
