"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Menu } from "@base-ui/react/menu";
import {
  ArrowDown,
  ArrowUp,
  Check,
  MoreVertical,
  Pause,
  Pencil,
  Play,
  Share2,
  Trash2,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { useShallow } from "zustand/shallow";
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
import { todayTasks } from "@/lib/types";
import { PageShell } from "@/components/page-shell";
import { LoadError } from "@/components/load-error";
import { TaskRow } from "@/features/tasks";
import { GoalDialog, NewGoalDialog } from "./new-goal-dialog";
import { ShareDialog } from "@/features/account";
import { Button } from "@/components/ui/button";
import {
  DueBadge,
  LoadingState,
  ProgressBar,
  SectionLabel,
  menuItemClass,
  menuItemDestructiveClass,
  menuPopupClass,
} from "@/components/ui-bits";
import { cn, goalHref } from "@/lib/utils";

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
 * The three-dots menu every dashboard goal row carries: edit, pause/resume
 * (hidden for completed goals), reorder within the row's section, delete.
 * `prevId`/`nextId` are the visible section neighbours — absent at the edges,
 * which disables the move items.
 */
function GoalMenu({ goal, prevId, nextId }: { goal: Goal; prevId?: string; nextId?: string }) {
  const { updateGoal, setGoalStatus, reorderGoal, deleteGoal } = useStore(
    useShallow((s) => ({
      updateGoal: s.updateGoal,
      setGoalStatus: s.setGoalStatus,
      reorderGoal: s.reorderGoal,
      deleteGoal: s.deleteGoal,
    }))
  );
  const [editOpen, setEditOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const complete = isGoalComplete(goal);
  const paused = goalStatus(goal) === "paused";

  return (
    <>
      <Menu.Root>
        <Menu.Trigger
          aria-label="Goal options"
          className="relative z-10 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <MoreVertical className="h-4 w-4" />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner side="bottom" align="end" sideOffset={6} className="z-50">
            <Menu.Popup className={menuPopupClass}>
              <Menu.Item onClick={() => setEditOpen(true)} className={menuItemClass}>
                <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                Edit
              </Menu.Item>
              <Menu.Item onClick={() => setShareOpen(true)} className={menuItemClass}>
                <Share2 className="h-3.5 w-3.5 text-muted-foreground" />
                Share
              </Menu.Item>
              {!complete &&
                (paused ? (
                  <Menu.Item
                    onClick={() => setGoalStatus(goal.id, "active")}
                    className={menuItemClass}
                  >
                    <Play className="h-3.5 w-3.5 text-muted-foreground" />
                    Resume
                  </Menu.Item>
                ) : (
                  <Menu.Item
                    onClick={() => setGoalStatus(goal.id, "paused")}
                    className={menuItemClass}
                  >
                    <Pause className="h-3.5 w-3.5 text-muted-foreground" />
                    Pause
                  </Menu.Item>
                ))}
              <Menu.Item
                disabled={!prevId}
                onClick={prevId ? () => reorderGoal(goal.id, prevId, "before") : undefined}
                className={menuItemClass}
              >
                <ArrowUp className="h-3.5 w-3.5 text-muted-foreground" />
                Move up
              </Menu.Item>
              <Menu.Item
                disabled={!nextId}
                onClick={nextId ? () => reorderGoal(goal.id, nextId, "after") : undefined}
                className={menuItemClass}
              >
                <ArrowDown className="h-3.5 w-3.5 text-muted-foreground" />
                Move down
              </Menu.Item>
              <Menu.Item onClick={() => deleteGoal(goal.id)} className={menuItemDestructiveClass}>
                <Trash2 className="h-3.5 w-3.5" />
                Delete goal
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>

      <GoalDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        heading="Edit goal"
        description="Rename this goal, change why it matters, or set a deadline."
        submitLabel="Save goal"
        initialTitle={goal.title}
        initialWhy={goal.why ?? ""}
        initialDueDate={goal.dueDate}
        onSubmit={(title, why, dueDate) => updateGoal(goal.id, title, why, dueDate)}
      />
      <ShareDialog open={shareOpen} onOpenChange={setShareOpen} goal={goal} />
    </>
  );
}

/**
 * An in-progress goal card. The whole card navigates via a stretched title
 * link (an `after:` overlay), so the inline actions — Done / Pause / Break it
 * down — can be real buttons layered above it rather than nested inside a Link.
 */
function GoalRow({ goal, prevId, nextId }: { goal: Goal; prevId?: string; nextId?: string }) {
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
              href={goalHref(goal)}
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
          <GoalMenu goal={goal} prevId={prevId} nextId={nextId} />
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
              onClick={() => router.push(goalHref(goal))}
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
function PausedRow({ goal, prevId, nextId }: { goal: Goal; prevId?: string; nextId?: string }) {
  const setGoalStatus = useStore((s) => s.setGoalStatus);
  const { done, total } = goalStepCounts(goal);

  return (
    <div className="relative flex items-center justify-between gap-4 rounded-xl border border-border bg-card px-6 py-2.5">
      <Link
        href={goalHref(goal)}
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
        <GoalMenu goal={goal} prevId={prevId} nextId={nextId} />
      </div>
    </div>
  );
}

/** A finished goal, collapsed to one line with a small reward instead of 100%. */
function CompletedRow({ goal, prevId, nextId }: { goal: Goal; prevId?: string; nextId?: string }) {
  const { total } = goalStepCounts(goal);

  return (
    <div className="relative flex items-center justify-between gap-4 rounded-xl border border-primary/40 bg-secondary/60 px-6 py-2.5">
      <Link
        href={goalHref(goal)}
        className="flex min-w-0 items-center gap-2 text-sm font-medium after:absolute after:inset-0 after:rounded-xl"
      >
        <Check className="h-4 w-4 flex-shrink-0 text-primary" aria-hidden />
        <span className="truncate">{goal.title}</span>
      </Link>
      <div className="flex flex-shrink-0 items-center gap-3">
        <span className="whitespace-nowrap text-xs text-muted-foreground">
          {total} {total === 1 ? "step" : "steps"} · finished {completedIn(goal)}
        </span>
        <GoalMenu goal={goal} prevId={prevId} nextId={nextId} />
      </div>
    </div>
  );
}

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
