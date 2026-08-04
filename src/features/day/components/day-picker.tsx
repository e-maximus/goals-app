"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Target, X } from "lucide-react";
import { useStore } from "@/lib/store";
import { useShallow } from "zustand/shallow";
import {
  daysSinceActivity,
  goalStatus,
  isGoalComplete,
  isTaskDone,
  lastActivityAt,
  leftFromBefore,
  nextStep,
  ungroupedSteps,
  type Goal,
  type Step,
  type Task,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { DueBadge } from "@/components/ui-bits";
import { TaskDialog } from "@/features/tasks";
import { cn, goalHref } from "@/lib/utils";
import { PickRow } from "./pick-row";

/** "Monday" and "4 August", both read in UTC — the day itself is a UTC midnight. */
function dayNames(day: number): { weekday: string; date: string } {
  const d = new Date(day);
  return {
    weekday: d.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" }),
    date: d.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" }),
  };
}

/** Every open step of an active, unfinished goal, with the goal it came from. */
function openSteps(goals: Goal[]): { goal: Goal; step: Step }[] {
  return goals
    .filter((g) => goalStatus(g) === "active" && !isGoalComplete(g))
    .flatMap((goal) =>
      [...ungroupedSteps(goal), ...goal.groups.flatMap((gr) => gr.steps)]
        .filter((step) => !step.done)
        .map((step) => ({ goal, step }))
    );
}

/** The active goal that has gone quietest while still having something open. */
function quietestGoal(goals: Goal[], now: number): { goal: Goal; step: Step; days: number } | null {
  const candidates = goals
    .filter((g) => goalStatus(g) === "active" && !isGoalComplete(g))
    .flatMap((goal) => {
      const next = nextStep(goal);
      return next ? [{ goal, step: next.step }] : [];
    })
    .sort((a, b) => lastActivityAt(a.goal) - lastActivityAt(b.goal));
  const oldest = candidates[0];
  if (!oldest) return null;
  return { ...oldest, days: daysSinceActivity(oldest.goal, now) };
}

type TabKey = "overdue" | "due" | "dailies" | "steps" | "everything";

/**
 * The morning ritual: the day being built on the left, everything that could go
 * into it on the right. Nothing here is saved until the day is started — except
 * a task the user captures outright, which is a real capture and stays on the
 * task list even if it doesn't make today's cut.
 */
export function DayPicker({
  day,
  initialSelection,
  onDone,
}: {
  /** The day being planned, as a UTC midnight. */
  day: number;
  initialSelection: string[];
  /** Called once the day has been settled, so the screen can leave the ritual. */
  onDone: () => void;
}) {
  const { tasks, goals, addTask, planTasks, settleDay } = useStore(
    useShallow((s) => ({
      tasks: s.tasks,
      goals: s.goals,
      addTask: s.addTask,
      planTasks: s.planTasks,
      settleDay: s.settleDay,
    }))
  );

  const [chosen, setChosen] = useState<string[]>(initialSelection);
  const [tab, setTab] = useState<TabKey>("overdue");
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  // Steps borrowed into today during this sitting, so their row can read as
  // taken. A step is not itself schedulable (see the proposal) — pulling one in
  // creates a task pointing at its goal.
  const [borrowed, setBorrowed] = useState<string[]>([]);

  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const chosenTasks = chosen.map((id) => byId.get(id)).filter((t): t is Task => t !== undefined);
  const isChosen = (id: string) => chosen.includes(id);
  const add = (id: string) => setChosen((c) => (c.includes(id) ? c : [...c, id]));
  const remove = (id: string) => setChosen((c) => c.filter((x) => x !== id));

  const overdue = tasks.filter(
    (t) => !t.daily && !t.done && t.dueDate !== undefined && t.dueDate < day
  );
  const dueToday = tasks.filter((t) => !t.daily && !t.done && t.dueDate === day);
  const dailies = tasks.filter((t) => t.daily);
  // `day` stands in for "now" throughout: it is the midnight of the day being
  // planned, which is the only clock this screen needs — and, unlike Date.now(),
  // it doesn't change under a re-render.
  const everything = tasks.filter((t) => !isTaskDone(t, day));
  const steps = openSteps(goals);
  const leftOver = leftFromBefore(tasks, day);
  const quiet = quietestGoal(goals, day);

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: "overdue", label: "Overdue", count: overdue.length },
    { key: "due", label: "Due today", count: dueToday.length },
    { key: "dailies", label: "Dailies", count: dailies.length },
    { key: "steps", label: "Goal steps", count: steps.length },
    { key: "everything", label: "Everything", count: everything.length },
  ];
  const offered: Task[] =
    tab === "overdue"
      ? overdue
      : tab === "due"
        ? dueToday
        : tab === "dailies"
          ? dailies
          : tab === "everything"
            ? everything
            : [];

  const goalOf = (task: Task) => (task.goalId ? goals.find((g) => g.id === task.goalId) : undefined);

  /** Pull a goal's step into today as a task pointing back at that goal. */
  const borrowStep = (goal: Goal, step: Step) => {
    const task = addTask(step.text, { goalId: goal.id });
    setBorrowed((b) => [...b, step.id]);
    add(task.id);
  };

  const commit = () => {
    planTasks(chosen, day);
    settleDay(day);
    onDone();
  };

  const skip = () => {
    // Skipping is a decision too: it settles the day so the ritual doesn't ask
    // again, and clears anything a previous sitting had planned for it.
    planTasks([], day);
    settleDay(day);
    onDone();
  };

  const { weekday, date } = dayNames(day);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end gap-4">
        <div className="min-w-[12rem] flex-1">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Plan {weekday}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {date} · {overdue.length} overdue, {dueToday.length} due today, {dailies.length}{" "}
            {dailies.length === 1 ? "daily" : "dailies"}
          </p>
        </div>
        <div className="flex flex-shrink-0 gap-2">
          <Button variant="outline" size="lg" onClick={skip}>
            Skip for today
          </Button>
          <Button size="lg" onClick={commit}>
            Start the day
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* ---- the day being built ---- */}
        <section aria-labelledby="plan-heading">
          <p
            id="plan-heading"
            className="mb-2 flex items-baseline gap-2 px-1 text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground"
          >
            Today
            <span className="ml-auto normal-case tracking-normal">{chosen.length} chosen</span>
          </p>
          <div className="min-h-[16rem] rounded-2xl border border-border-strong bg-card p-2 shadow-sm">
            {chosenTasks.map((task) => {
              const goal = goalOf(task);
              return (
                <div
                  key={task.id}
                  className="flex items-start gap-2.5 rounded-lg px-2 py-2 hover:bg-muted/60"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-sm font-medium">{task.title}</span>
                      {task.daily && (
                        <span className="inline-flex flex-shrink-0 items-center rounded-full border border-border px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                          daily
                        </span>
                      )}
                      <DueBadge dueDate={task.daily ? undefined : task.dueDate} done={task.done} />
                      {goal && (
                        <Link
                          href={goalHref(goal)}
                          className="inline-flex max-w-48 flex-shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
                        >
                          <Target className="h-3 w-3 flex-shrink-0" aria-hidden />
                          <span className="truncate">{goal.title}</span>
                        </Link>
                      )}
                    </div>
                    {task.description && (
                      <div className="mt-0.5 text-[13px] text-muted-foreground">
                        {task.description}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => remove(task.id)}
                    aria-label={`Remove ${task.title} from today`}
                    className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
            <p className="mt-2 rounded-lg border border-dashed border-border-strong px-4 py-4 text-center text-[13px] text-muted-foreground">
              {chosenTasks.length === 0
                ? "Nothing chosen yet — pick from the list beside this one."
                : "Add more from the list beside this one."}
            </p>
          </div>
        </section>

        {/* ---- everything that could go into it ---- */}
        <section aria-labelledby="bring-in-heading">
          <p
            id="bring-in-heading"
            className="mb-2 px-1 text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground"
          >
            Bring in
          </p>

          <div role="tablist" aria-label="What to bring in" className="mb-2 flex flex-wrap gap-1">
            {tabs.map((t) => (
              <button
                key={t.key}
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[13px] font-semibold transition-colors",
                  tab === t.key
                    ? "border-transparent bg-secondary text-secondary-foreground"
                    : "border-border text-muted-foreground hover:text-foreground"
                )}
              >
                {t.label} · {t.count}
              </button>
            ))}
          </div>

          <div className="rounded-2xl border border-border bg-card px-2 py-2 shadow-sm">
            {tab === "steps" ? (
              steps.length === 0 ? (
                <Empty>No open steps on your active goals.</Empty>
              ) : (
                steps.map(({ goal, step }) => (
                  <PickRow
                    key={step.id}
                    title={step.text}
                    description={step.description}
                    goal={goal}
                    dueDate={step.dueDate}
                    taken={borrowed.includes(step.id)}
                    onAdd={() => borrowStep(goal, step)}
                  />
                ))
              )
            ) : offered.length === 0 ? (
              <Empty>Nothing here today.</Empty>
            ) : (
              offered.map((task) => (
                <PickRow
                  key={task.id}
                  title={task.title}
                  description={task.description}
                  goal={goalOf(task)}
                  dueDate={task.dueDate}
                  daily={task.daily}
                  taken={isChosen(task.id)}
                  onAdd={() => add(task.id)}
                />
              ))
            )}
          </div>

          {leftOver.length > 0 && (
            <>
              <p className="mb-2 mt-5 px-1 text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
                Left from yesterday
              </p>
              <div className="rounded-2xl border border-border bg-card px-2 py-2 shadow-sm">
                {leftOver.map((task) => (
                  <PickRow
                    key={task.id}
                    title={task.title}
                    description={task.description}
                    goal={goalOf(task)}
                    dueDate={task.dueDate}
                    taken={isChosen(task.id)}
                    onAdd={() => add(task.id)}
                  />
                ))}
              </div>
            </>
          )}

          {quiet && (
            <>
              <p className="mb-2 mt-5 px-1 text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
                Not touched in a while
              </p>
              <div className="rounded-2xl border border-border bg-card px-2 py-2 shadow-sm">
                <PickRow
                  title={quiet.step.text}
                  description={`This goal hasn't moved in ${quiet.days} ${
                    quiet.days === 1 ? "day" : "days"
                  }.`}
                  goal={quiet.goal}
                  taken={borrowed.includes(quiet.step.id)}
                  onAdd={() => borrowStep(quiet.goal, quiet.step)}
                />
              </div>
            </>
          )}

          <button
            onClick={() => setNewTaskOpen(true)}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border-strong px-4 py-3 text-sm font-semibold text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
          >
            + Something new, just for today
          </button>
        </section>
      </div>

      <TaskDialog
        open={newTaskOpen}
        onOpenChange={setNewTaskOpen}
        title="Something new, just for today"
        description="Capture it and it goes straight into the day you're building."
        submitLabel="Add to today"
        goals={goals}
        onSubmit={(title, values) => add(addTask(title, values).id)}
      />
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-2 py-6 text-center text-[13px] text-muted-foreground">{children}</p>;
}
