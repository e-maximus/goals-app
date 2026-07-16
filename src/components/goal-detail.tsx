"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useStore } from "@/lib/store";
import {
  goalProgress,
  goalStatus,
  goalStepCounts,
  isGoalComplete,
  nextStep,
  ungroupedSteps,
} from "@/lib/types";
import { Topbar, Crumbs } from "@/components/topbar";
import { LoadError } from "@/components/load-error";
import { GoalDialog } from "@/components/new-goal-dialog";
import { GroupDialog } from "@/components/group-dialog";
import { StepDialog } from "@/components/step-dialog";
import {
  GroupCardConnected,
  AddGroupCard,
  UngroupedStepsCard,
} from "@/components/group-card";
import { GoalBanner } from "@/components/goal-banner";
import { GoalStepper } from "@/components/goal-stepper";
import { NotesSection } from "@/components/notes-section";
import { LoadingState, SectionLabel } from "@/components/ui-bits";
import { Button, buttonVariants } from "@/components/ui/button";
import { useGoalView, type GoalView } from "@/lib/use-goal-view";
import { cn } from "@/lib/utils";
import { Check, List, Milestone, Pause, Play, Plus } from "lucide-react";
import { ShareDialog } from "@/components/share-dialog";

/** The list / timeline segmented toggle shown next to the Groups label. */
function ViewToggle({ view, onChange }: { view: GoalView; onChange: (v: GoalView) => void }) {
  const option = (value: GoalView, label: string, Icon: typeof List) => (
    <button
      onClick={() => onChange(value)}
      aria-pressed={view === value}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold normal-case tracking-normal transition-colors",
        view === value
          ? "bg-card text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {label}
    </button>
  );
  return (
    <div className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
      {option("list", "List", List)}
      {option("timeline", "Timeline", Milestone)}
    </div>
  );
}

export function GoalDetail({ goalId }: { goalId: string }) {
  const goal = useStore((s) => s.goals.find((g) => g.id === goalId));
  const loadStatus = useStore((s) => s.loadStatus);
  const updateGoal = useStore((s) => s.updateGoal);
  const addGroup = useStore((s) => s.addGroup);
  const addStep = useStore((s) => s.addStep);
  const deleteGoal = useStore((s) => s.deleteGoal);
  const setGoalStatus = useStore((s) => s.setGoalStatus);
  const router = useRouter();
  const [editGoalOpen, setEditGoalOpen] = useState(false);
  const [addGroupOpen, setAddGroupOpen] = useState(false);
  const [addStepOpen, setAddStepOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [view, setView] = useGoalView(goalId);
  // Which groups the user explicitly opened/closed. Until they touch one, the
  // default applies: only the active group (the one holding the next step) is
  // expanded. Keyed by goal id so navigating to another goal starts fresh.
  const [expandedState, setExpandedState] = useState<{
    goalId: string;
    ids: Set<string>;
  } | null>(null);

  if (loadStatus === "loading") {
    return (
      <div className="flex flex-1 flex-col">
        <Topbar crumbs={<Crumbs goalTitle="…" />} />
        <LoadingState label="Loading goal…" />
      </div>
    );
  }

  if (loadStatus === "error") {
    return (
      <div className="flex flex-1 flex-col">
        <Topbar crumbs={<Crumbs />} />
        <LoadError />
      </div>
    );
  }

  if (!goal) {
    return (
      <div className="flex flex-1 flex-col">
        <Topbar crumbs={<Crumbs />} />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-24 text-center">
          <h2 className="text-xl font-bold">Goal not found</h2>
          <p className="text-sm text-muted-foreground">
            It may have been deleted.
          </p>
          <Link href="/" className={buttonVariants({ variant: "outline" })}>
            Back to my goals
          </Link>
        </div>
      </div>
    );
  }

  const pct = goalProgress(goal);
  const { done, total } = goalStepCounts(goal);
  const complete = isGoalComplete(goal);
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

  return (
    <div className="flex flex-1 flex-col">
      <Topbar crumbs={<Crumbs goalTitle={goal.title} />} />

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 sm:px-10">
        {/* Goal banner */}
        <div className="mb-7">
          <GoalBanner
            title={goal.title}
            why={goal.why}
            pct={pct}
            dueDate={goal.dueDate}
            complete={complete}
            onEdit={() => setEditGoalOpen(true)}
            onShare={() => setShareOpen(true)}
            onDelete={() => {
              deleteGoal(goal.id);
              router.push("/");
            }}
          />
        </div>

        {/* Paused banner — also legible when an agent paused the goal over MCP */}
        {paused && !complete && (
          <div className="mb-7 flex items-center justify-between gap-4 rounded-2xl border border-border bg-muted/50 px-7 py-4">
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
          <div className="mb-7 flex items-center gap-4 rounded-2xl border border-primary/60 bg-secondary px-7 py-5">
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

        {hasAnything ? (
          <>
            <SectionLabel action={hasGroups ? <ViewToggle view={view} onChange={setView} /> : undefined}>
              Steps
              {total > 0 && (
                <span className="font-medium normal-case tracking-normal text-muted-foreground/70">
                  {" "}
                  — {done}/{total} done
                </span>
              )}
            </SectionLabel>
            <div className="flex flex-col gap-4">
              {/* In the timeline view the ungrouped steps become stages on the
                  rail itself, so the standalone card only renders in the list
                  view (or when there are no groups and thus no timeline). */}
              {ungrouped.length > 0 && (view === "list" || !hasGroups) && (
                <UngroupedStepsCard
                  goalId={goal.id}
                  steps={ungrouped}
                  nextStepId={next && next.group === null ? nextStepId : null}
                />
              )}
              {hasGroups &&
                (view === "timeline" ? (
                  <GoalStepper goal={goal} activeGroupId={activeGroupId} nextStepId={nextStepId} />
                ) : (
                  goal.groups.map((group) => (
                    <GroupCardConnected
                      key={group.id}
                      goalId={goal.id}
                      group={group}
                      collapsible
                      collapsed={!expanded.has(group.id)}
                      onToggleCollapse={() => toggleExpanded(group.id)}
                      nextStepId={group.id === activeGroupId ? nextStepId : null}
                    />
                  ))
                ))}
              <div className="flex flex-col gap-2 sm:flex-row">
                {ungrouped.length === 0 && (
                  <button
                    onClick={() => setAddStepOpen(true)}
                    className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-dashed border-border-strong px-4 py-3.5 text-sm font-semibold text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
                  >
                    <Plus className="h-4 w-4" />
                    Add step
                  </button>
                )}
                <div className="flex-1">
                  <AddGroupCard onClick={() => setAddGroupOpen(true)} />
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="mt-2 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border-strong px-5 py-14 text-center">
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

        <NotesSection goalId={goal.id} groups={linkableGroups} notes={goal.notes ?? []} />
      </main>

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
    </div>
  );
}
