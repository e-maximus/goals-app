"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Check, Plus } from "lucide-react";
import { useStore } from "@/lib/store";
import {
  goalStatus,
  goalStepCounts,
  isGoalComplete,
  nextStep,
  todayTasks,
  type Goal,
  type Task,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { TaskDialog } from "@/features/tasks";
import { NewGoalDialog } from "./new-goal-dialog";
import { cn, goalHref } from "@/lib/utils";

/** A friendly, data-aware line under the greeting. */
function heroSubtitle(active: number, stepsDone: number, hasNext: boolean): string {
  if (active === 0) {
    return goalsExistLine(stepsDone);
  }
  const goalPart = `${active} goal${active === 1 ? "" : "s"} in motion`;
  const stepPart = stepsDone > 0 ? ` and ${stepsDone} step${stepsDone === 1 ? "" : "s"} already behind you` : "";
  const tail = hasNext ? ". The next one is small — let’s take it." : ".";
  return `${goalPart}${stepPart}${tail}`;
}

function goalsExistLine(stepsDone: number): string {
  return stepsDone > 0
    ? "Nothing active right now — pick a goal back up whenever you’re ready."
    : "Everything starts with a small step.";
}

/** The hero: greeting, quick actions, the day's next step, and an at-a-glance
 *  pulse — all in one card, the way the redesign leads with it. */
export function FocusHero({ name, goals, tasks }: { name: string | null; goals: Goal[]; tasks: Task[] }) {
  const router = useRouter();
  const addGoal = useStore((s) => s.addGoal);
  const addTask = useStore((s) => s.addTask);
  const [goalOpen, setGoalOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);

  const active = goals.filter((g) => !isGoalComplete(g) && goalStatus(g) === "active").length;
  const completed = goals.filter(isGoalComplete).length;
  const stepsDone = goals.reduce((n, g) => n + goalStepCounts(g).done, 0);
  const today = todayTasks(tasks).length;

  const candidate = goals
    .filter((g) => !isGoalComplete(g) && goalStatus(g) === "active")
    .map((g) => ({ goal: g, next: nextStep(g) }))
    .find((c) => c.next !== null);
  const hasGoals = goals.length > 0;

  const tiles: { label: string; value: number }[] = [
    { label: active === 1 ? "active goal" : "active goals", value: active },
    { label: "steps done", value: stepsDone },
    { label: "tasks today", value: today },
    { label: "completed", value: completed },
  ];

  return (
    <section className="overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/10">
      <div className="flex flex-wrap items-start gap-4 px-6 pb-5 pt-6 sm:px-7">
        <span className="text-3xl leading-none" aria-hidden>
          👣
        </span>
        <div className="min-w-[15rem] flex-1">
          <h1 className="text-2xl font-bold tracking-tight">
            {name ? `Keep going, ${name}.` : "Keep going."}
          </h1>
          <p className="mt-1 text-[15px] leading-snug text-muted-foreground">
            {heroSubtitle(active, stepsDone, Boolean(candidate?.next))}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setGoalOpen(true)}>
            <Plus data-icon="inline-start" /> New goal
          </Button>
          <Button size="sm" variant="outline" onClick={() => setTaskOpen(true)}>
            <Plus data-icon="inline-start" /> Add a task
          </Button>
        </div>
      </div>

      {candidate?.next ? (
        <ResumeBanner goal={candidate.goal} next={candidate.next} />
      ) : !hasGoals ? (
        <FirstGoalPrompt onNewGoal={() => setGoalOpen(true)} />
      ) : null}

      {hasGoals && (
        <div className="mt-5 grid grid-cols-2 border-t border-border sm:grid-cols-4">
          {tiles.map((t, i) => (
            <div
              key={t.label}
              className={cn(
                "px-5 py-4",
                i % 2 === 0 && "border-r border-border",
                i < 2 && "border-b border-border sm:border-b-0",
                i === 2 && "sm:border-r sm:border-border"
              )}
            >
              <div className="text-[22px] font-bold tabular-nums leading-none">{t.value}</div>
              <div className="mt-1 text-[12.5px] text-muted-foreground">{t.label}</div>
            </div>
          ))}
        </div>
      )}

      <NewGoalDialog
        open={goalOpen}
        onOpenChange={setGoalOpen}
        onCreate={(title, why) => router.push(goalHref(addGoal(title, why)))}
      />
      <TaskDialog
        open={taskOpen}
        onOpenChange={setTaskOpen}
        title="New task"
        description="A one-off to-do or a daily habit — optionally tied to one of your goals."
        submitLabel="Add task"
        goals={goals}
        onSubmit={(title, values) => addTask(title, values)}
      />
    </section>
  );
}

/** "Pick up where you left off" — the single most relevant next step across
 *  every active goal, checkable in place. */
function ResumeBanner({
  goal,
  next,
}: {
  goal: Goal;
  next: NonNullable<ReturnType<typeof nextStep>>;
}) {
  const toggleStep = useStore((s) => s.toggleStep);

  return (
    <div className="mx-6 flex items-center justify-between gap-4 rounded-xl bg-secondary px-4.5 py-4 ring-1 ring-primary/15 sm:mx-7">
      <div className="min-w-0">
        <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-secondary-foreground">
          Pick up where you left off
        </div>
        <Link href={goalHref(goal)} className="mt-0.5 block text-sm font-semibold hover:underline">
          {goal.title}
        </Link>
        <div className="mt-px truncate text-[13px] text-muted-foreground">
          Next: <span className="font-medium text-foreground">{next.step.text}</span>
          {next.group ? ` · ${next.group.title}` : ""}
        </div>
      </div>
      <Button
        size="sm"
        className="flex-shrink-0"
        onClick={() => toggleStep(goal.id, next.group?.id ?? null, next.step.id)}
      >
        Done <Check data-icon="inline-end" />
      </Button>
    </div>
  );
}

/** Shown inside the hero when the account has no goals yet. */
function FirstGoalPrompt({ onNewGoal }: { onNewGoal: () => void }) {
  return (
    <div className="mx-6 flex items-center justify-between gap-4 rounded-xl bg-secondary px-4.5 py-4 ring-1 ring-primary/15 sm:mx-7">
      <div className="min-w-0">
        <div className="text-sm font-semibold">No goals yet</div>
        <div className="mt-px text-[13px] text-muted-foreground">
          Start with one small thing you want to move toward.
        </div>
      </div>
      <Button size="sm" className="flex-shrink-0" onClick={onNewGoal}>
        Create your first goal <ArrowRight data-icon="inline-end" />
      </Button>
    </div>
  );
}
