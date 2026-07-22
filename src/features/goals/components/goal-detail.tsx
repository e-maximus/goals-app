"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Menu } from "@base-ui/react/menu";
import { useStore } from "@/lib/store";
import {
  goalProgress,
  goalStatus,
  goalStepCounts,
  isGoalComplete,
  nextStep,
  ungroupedSteps,
} from "@/lib/types";
import { PageShell, Crumbs } from "@/components/page-shell";
import { LoadError } from "@/components/load-error";
import { GoalDialog } from "./new-goal-dialog";
import { GroupDialog } from "./group-dialog";
import { StepDialog } from "./step-dialog";
import {
  GroupCardConnected,
  AddGroupCard,
  UngroupedStepsList,
} from "./group-card";
import { NotesSection } from "./notes-section";
import { TaskDialog } from "@/features/tasks";
import { TaskRow } from "@/features/tasks";
import {
  DueBadge,
  LoadingState,
  SectionLabel,
  menuItemClass,
  menuItemDestructiveClass,
  menuPopupClass,
} from "@/components/ui-bits";
import { Button, buttonVariants } from "@/components/ui/button";
import { celebrate } from "@/lib/confetti";
import { goalIdMatchesPath } from "@/lib/utils";
import { Check, MoreVertical, Pause, Pencil, Play, Plus, Share2, Trash2 } from "lucide-react";
import { ShareDialog } from "@/features/account";

/**
 * The tasks tied to this goal — the day-to-day to-dos living next to the plan.
 * They never feed the goal's progress; that stays derived from steps alone.
 */
function GoalTasksSection({ goalId }: { goalId: string }) {
  const tasks = useStore((s) => s.tasks);
  const goals = useStore((s) => s.goals);
  const addTask = useStore((s) => s.addTask);
  const [addOpen, setAddOpen] = useState(false);

  const goalTasks = tasks.filter((t) => t.goalId === goalId);

  return (
    <section className="mt-10">
      <SectionLabel
        action={
          <Button variant="ghost" size="sm" onClick={() => setAddOpen(true)}>
            <Plus data-icon="inline-start" /> Add task
          </Button>
        }
      >
        Tasks
        {goalTasks.length > 0 && (
          <span className="font-medium normal-case tracking-normal text-muted-foreground/70">
            {" "}
            — {goalTasks.length}
          </span>
        )}
      </SectionLabel>
      {goalTasks.length > 0 ? (
        <div className="rounded-2xl border border-border bg-card px-3 py-2 shadow-sm">
          {goalTasks.map((t) => (
            <TaskRow key={t.id} task={t} showGoal={false} fixedGoalId={goalId} />
          ))}
        </div>
      ) : (
        <p className="text-[13px] text-muted-foreground">
          No tasks tied to this goal yet — day-to-day to-dos live here, separate from the
          plan&apos;s steps.
        </p>
      )}

      <TaskDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Add task"
        description="Add a to-do tied to this goal. It won't affect the goal's progress."
        submitLabel="Add task"
        goals={goals}
        fixedGoalId={goalId}
        onSubmit={(title, values) => addTask(title, values)}
      />
    </section>
  );
}

/** A donut ring showing goal progress, with the percentage in the centre. */
function ProgressRing({ pct }: { pct: number }) {
  const value = Math.max(0, Math.min(100, pct));
  return (
    <div
      className="relative h-16 w-16 flex-none rounded-full"
      style={{ background: `conic-gradient(var(--primary) ${value}%, var(--muted) 0)` }}
      role="img"
      aria-label={`${value}% complete`}
    >
      <div className="absolute inset-[7px] flex items-center justify-center rounded-full bg-card text-sm font-bold tabular-nums text-primary">
        {value}%
      </div>
    </div>
  );
}

/** Edit / Share / Delete for the goal, floating in the summary card's corner. */
function GoalOptionsMenu({
  onEdit,
  onShare,
  onDelete,
}: {
  onEdit: () => void;
  onShare: () => void;
  onDelete: () => void;
}) {
  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label="Goal options"
        className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:opacity-100 data-[popup-open]:bg-muted"
      >
        <MoreVertical className="h-4 w-4" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="bottom" align="end" sideOffset={6} className="z-50">
          <Menu.Popup className={menuPopupClass}>
            <Menu.Item onClick={onEdit} className={menuItemClass}>
              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
              Edit
            </Menu.Item>
            <Menu.Item onClick={onShare} className={menuItemClass}>
              <Share2 className="h-3.5 w-3.5 text-muted-foreground" />
              Share
            </Menu.Item>
            <Menu.Item onClick={onDelete} className={menuItemDestructiveClass}>
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

/**
 * The goal's summary, pinned in the right rail: title, why it matters, a
 * progress ring, and the single next step with a one-tap "Mark done". It owns
 * the goal-level actions (edit / share / delete) via the corner menu.
 */
function GoalSummaryRail({
  title,
  why,
  dueDate,
  pct,
  done,
  total,
  complete,
  next,
  onMarkNextDone,
  onEdit,
  onShare,
  onDelete,
}: {
  title: string;
  why?: string;
  dueDate?: number;
  pct: number;
  done: number;
  total: number;
  complete: boolean;
  next: string | null;
  onMarkNextDone: () => void;
  onEdit: () => void;
  onShare: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="relative flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <GoalOptionsMenu onEdit={onEdit} onShare={onShare} onDelete={onDelete} />

      <div className="pr-8">
        <div className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
          Goal
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-bold leading-tight">{title}</h1>
          <DueBadge dueDate={dueDate} done={complete} />
        </div>
        {why && (
          <p className="mt-1.5 whitespace-pre-line text-[12.5px] leading-relaxed text-muted-foreground">
            {why}
          </p>
        )}
      </div>

      <div className="flex items-center gap-3.5">
        <ProgressRing pct={pct} />
        <div className="text-[12.5px] leading-relaxed text-muted-foreground">
          <b className="font-semibold text-foreground">
            {done} of {total}
          </b>{" "}
          {total === 1 ? "step" : "steps"} done
          <br />
          {complete
            ? "All done — nice work."
            : total === 0
              ? "Add a step to begin."
              : `Keep going — ${total - done} to go.`}
        </div>
      </div>

      {next && (
        <div className="rounded-xl bg-secondary/60 p-3 ring-1 ring-inset ring-primary/15">
          <div className="mb-1 text-[10.5px] font-bold uppercase tracking-[0.08em] text-secondary-foreground">
            Next step
          </div>
          <div className="text-[13px] font-semibold">{next}</div>
          <Button size="sm" className="mt-2.5 w-full" onClick={onMarkNextDone}>
            Mark done
          </Button>
        </div>
      )}
    </div>
  );
}

export function GoalDetail({ goalId }: { goalId: string }) {
  // The route param is `<id>-<slug>` (or a bare id from an old link). Resolve it
  // to the goal whose id it carries, preferring the longest matching id so a
  // shorter id can't shadow a longer one that happens to share its prefix.
  const goal = useStore((s) =>
    s.goals.reduce<(typeof s.goals)[number] | undefined>((best, g) => {
      if (!goalIdMatchesPath(g.id, goalId)) return best;
      return !best || g.id.length > best.id.length ? g : best;
    }, undefined)
  );
  const loadStatus = useStore((s) => s.loadStatus);
  const updateGoal = useStore((s) => s.updateGoal);
  const addGroup = useStore((s) => s.addGroup);
  const addStep = useStore((s) => s.addStep);
  const toggleStep = useStore((s) => s.toggleStep);
  const deleteGoal = useStore((s) => s.deleteGoal);
  const setGoalStatus = useStore((s) => s.setGoalStatus);
  const router = useRouter();
  const [editGoalOpen, setEditGoalOpen] = useState(false);
  const [addGroupOpen, setAddGroupOpen] = useState(false);
  const [addStepOpen, setAddStepOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  // Which groups the user explicitly opened/closed. Until they touch one, the
  // default applies: only the active group (the one holding the next step) is
  // expanded. Keyed by goal id so navigating to another goal starts fresh.
  const [expandedState, setExpandedState] = useState<{
    goalId: string;
    ids: Set<string>;
  } | null>(null);

  // Fire the celebration only on the transition into completion — never when
  // opening an already-finished goal, and never for the same goal twice. The
  // ref seeds `undefined` so the first run just records the current state.
  const wasComplete = useRef<boolean | undefined>(undefined);
  const complete = goal ? isGoalComplete(goal) : false;
  useEffect(() => {
    if (!goal) return;
    if (wasComplete.current === false && complete) void celebrate();
    wasComplete.current = complete;
  }, [goal, complete]);

  if (loadStatus === "loading") {
    return (
      <PageShell crumbs={<Crumbs page="…" />} width="lg">
        <LoadingState label="Loading goal…" />
      </PageShell>
    );
  }

  if (loadStatus === "error") {
    return (
      <PageShell crumbs={<Crumbs />} width="lg">
        <LoadError />
      </PageShell>
    );
  }

  if (!goal) {
    return (
      <PageShell crumbs={<Crumbs />} width="lg">
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-24 text-center">
          <h2 className="text-xl font-bold">Goal not found</h2>
          <p className="text-sm text-muted-foreground">
            It may have been deleted.
          </p>
          <Link href="/goals" className={buttonVariants({ variant: "outline" })}>
            Back to my goals
          </Link>
        </div>
      </PageShell>
    );
  }

  const pct = goalProgress(goal);
  const { done, total } = goalStepCounts(goal);
  const paused = goalStatus(goal) === "paused";
  const ungrouped = ungroupedSteps(goal);
  const hasGroups = goal.groups.length > 0;
  const hasAnything = hasGroups || ungrouped.length > 0;

  const next = nextStep(goal);
  // The group holding the next step; null when it's an ungrouped step.
  const activeGroupId = next ? (next.group?.id ?? null) : (goal.groups[0]?.id ?? null);
  const nextStepId = next?.step.id ?? null;
  // Ungrouped steps render above the groups; when nothing is expanded-by-user
  // and the next step is ungrouped, no group needs to start open.
  const defaultExpandedId = next === null || next.group ? activeGroupId : null;
  // The notes composer links notes to steps through the groups list; surface
  // the ungrouped steps to it as a pseudo-group (its id is never persisted).
  const linkableGroups =
    ungrouped.length > 0
      ? [{ id: "__ungrouped", title: "Steps", steps: ungrouped }, ...goal.groups]
      : goal.groups;
  const expanded =
    expandedState?.goalId === goalId
      ? expandedState.ids
      : new Set(defaultExpandedId ? [defaultExpandedId] : []);
  const toggleExpanded = (groupId: string) => {
    const nextSet = new Set(expanded);
    if (nextSet.has(groupId)) nextSet.delete(groupId);
    else nextSet.add(groupId);
    setExpandedState({ goalId, ids: nextSet });
  };

  const markNextDone = () => {
    if (next) toggleStep(goal.id, next.group?.id ?? null, next.step.id);
  };

  return (
    <PageShell crumbs={<Crumbs page={goal.title} />} width="lg">
      {/* Paused banner — also legible when an agent paused the goal over MCP */}
      {paused && !complete && (
        <div className="mb-6 flex items-center justify-between gap-4 rounded-2xl border border-border bg-muted/50 px-7 py-4">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Pause className="h-4 w-4 flex-shrink-0" aria-hidden />
            <span>
              This goal is paused
              {goal.pausedAt
                ? ` since ${new Date(goal.pausedAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}`
                : ""}
              .
            </span>
          </div>
          <Button variant="outline" size="sm" onClick={() => setGoalStatus(goal.id, "active")}>
            <Play data-icon="inline-start" /> Resume
          </Button>
        </div>
      )}

      {/* Completion celebration */}
      {complete && (
        <div className="mb-6 flex items-center gap-4 rounded-2xl border border-primary/60 bg-secondary px-7 py-5">
          <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Check className="h-5 w-5" strokeWidth={3} />
          </span>
          <div>
            <div className="text-base font-bold">Goal complete</div>
            <div className="text-[13px] text-muted-foreground">
              {total === 1 ? "The only step is done" : `All ${total} steps are done`}. Nice work.
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
        {/* Summary rail. First in the DOM so it leads on mobile, pinned to the
            right column and made sticky on wide screens. */}
        <aside className="lg:sticky lg:top-20 lg:col-start-2 lg:row-start-1">
          <GoalSummaryRail
            title={goal.title}
            why={goal.why}
            dueDate={goal.dueDate}
            pct={pct}
            done={done}
            total={total}
            complete={complete}
            next={next?.step.text ?? null}
            onMarkNextDone={markNextDone}
            onEdit={() => setEditGoalOpen(true)}
            onShare={() => setShareOpen(true)}
            onDelete={() => {
              deleteGoal(goal.id);
              router.push("/goals");
            }}
          />
        </aside>

        <div className="lg:col-start-1 lg:row-start-1">
          {hasAnything ? (
            <>
              <SectionLabel>
                Steps
                {total > 0 && (
                  <span className="font-medium normal-case tracking-normal text-muted-foreground/70">
                    {" "}
                    — {done}/{total} done
                  </span>
                )}
              </SectionLabel>
              <div className="flex flex-col gap-3">
                {ungrouped.length > 0 && (
                  <UngroupedStepsList
                    goalId={goal.id}
                    steps={ungrouped}
                    nextStepId={next && next.group === null ? nextStepId : null}
                  />
                )}
                {goal.groups.map((group) => (
                  <GroupCardConnected
                    key={group.id}
                    goalId={goal.id}
                    group={group}
                    collapsible
                    collapsed={!expanded.has(group.id)}
                    onToggleCollapse={() => toggleExpanded(group.id)}
                    nextStepId={group.id === activeGroupId ? nextStepId : null}
                  />
                ))}
                {/* One clear action row at the very bottom. */}
                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    onClick={() => setAddStepOpen(true)}
                    className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-dashed border-border-strong px-4 py-3.5 text-sm font-semibold text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
                  >
                    <Plus className="h-4 w-4" />
                    Add step
                  </button>
                  <div className="flex-1">
                    <AddGroupCard onClick={() => setAddGroupOpen(true)} />
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border-strong px-5 py-14 text-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-full border border-dashed border-border-strong text-2xl text-muted-foreground">
                +
              </span>
              <div className="text-[15px] font-bold">No steps yet</div>
              <p className="max-w-sm text-[13px] text-muted-foreground">
                Break this goal down to get moving — start with a first step, or lay out groups of
                steps for a bigger plan
              </p>
              <div className="mt-2 flex items-center gap-2">
                <Button onClick={() => setAddStepOpen(true)}>+ Add step</Button>
                <Button variant="outline" onClick={() => setAddGroupOpen(true)}>
                  + Add group
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <GoalTasksSection goalId={goal.id} />

      <NotesSection goalId={goal.id} groups={linkableGroups} notes={goal.notes ?? []} />

      <GoalDialog
        open={editGoalOpen}
        onOpenChange={setEditGoalOpen}
        heading="Edit goal"
        description="Rename this goal, change why it matters, or set a deadline."
        submitLabel="Save goal"
        initialTitle={goal.title}
        initialWhy={goal.why ?? ""}
        initialDueDate={goal.dueDate}
        onSubmit={(title, why, dueDate) => updateGoal(goal.id, title, why, dueDate)}
      />
      <GroupDialog
        open={addGroupOpen}
        onOpenChange={setAddGroupOpen}
        title="Add group"
        description={<>Split &ldquo;{goal.title}&rdquo; into a new group of steps</>}
        submitLabel="Add group"
        onSubmit={(title, dueDate) => addGroup(goal.id, title, dueDate)}
      />
      <StepDialog
        open={addStepOpen}
        onOpenChange={setAddStepOpen}
        title="Add step"
        description="Add a step to this goal"
        submitLabel="Add step"
        onSubmit={(text, description, dueDate) => addStep(goal.id, null, text, description, dueDate)}
      />
      <ShareDialog open={shareOpen} onOpenChange={setShareOpen} goal={goal} />
    </PageShell>
  );
}
