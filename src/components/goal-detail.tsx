"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useStore } from "@/lib/store";
import {
  goalProgress,
  goalStepCounts,
  isGoalComplete,
} from "@/lib/types";
import { Topbar, Crumbs } from "@/components/topbar";
import { NewGoalDialog } from "@/components/new-goal-dialog";
import { PromptDialog } from "@/components/prompt-dialog";
import { GroupCard, AddGroupCard } from "@/components/group-card";
import { ProgressBar, SectionLabel } from "@/components/ui-bits";
import { Button, buttonVariants } from "@/components/ui/button";
import { Check } from "lucide-react";
import { ShareDialog } from "@/components/share-dialog";

export function GoalDetail({ goalId }: { goalId: string }) {
  const { getGoal, hydrated, addGoal, addGroup } = useStore();
  const router = useRouter();
  const [newGoalOpen, setNewGoalOpen] = useState(false);
  const [addGroupOpen, setAddGroupOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const goal = getGoal(goalId);

  const handleCreateGoal = (title: string, why?: string) => {
    const g = addGoal(title, why);
    router.push(`/goal?id=${g.id}`);
  };

  const openNewGoal = () => setNewGoalOpen(true);

  if (!hydrated) {
    return (
      <div className="flex flex-1 flex-col">
        <Topbar crumbs={<Crumbs goalTitle="…" />} onNewGoal={openNewGoal} showShare />
      </div>
    );
  }

  if (!goal) {
    return (
      <div className="flex flex-1 flex-col">
        <Topbar crumbs={<Crumbs />} onNewGoal={openNewGoal} />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-24 text-center">
          <h2 className="text-xl font-bold">Goal not found</h2>
          <p className="text-sm text-muted-foreground">
            It may have been deleted.
          </p>
          <Link href="/" className={buttonVariants({ variant: "outline" })}>
            Back to my goals
          </Link>
        </div>
        <NewGoalDialog open={newGoalOpen} onOpenChange={setNewGoalOpen} onCreate={handleCreateGoal} />
      </div>
    );
  }

  const pct = goalProgress(goal);
  const { done, total } = goalStepCounts(goal);
  const complete = isGoalComplete(goal);
  const hasGroups = goal.groups.length > 0;

  return (
    <div className="flex flex-1 flex-col">
      <Topbar crumbs={<Crumbs goalTitle={goal.title} />} onNewGoal={openNewGoal} showShare onShare={() => setShareOpen(true)} />

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 sm:px-10">
        {/* Goal banner */}
        <div className="mb-7 flex flex-col gap-5 rounded-2xl border border-border bg-card px-7 py-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Goal
            </div>
            <h1 className="text-2xl font-bold">{goal.title}</h1>
            {goal.why && (
              <p className="mt-2 max-w-xl text-sm text-muted-foreground">{goal.why}</p>
            )}
          </div>
          <div className="flex w-full items-center gap-4 sm:w-[260px] sm:flex-shrink-0">
            <ProgressBar value={pct} className="h-2.5" />
            <span className="tabular-nums text-xl font-bold text-primary">{pct}%</span>
          </div>
        </div>

        {/* Completion celebration */}
        {complete && (
          <div className="mb-7 flex items-center gap-4 rounded-2xl border border-primary/60 bg-secondary px-7 py-5">
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Check className="h-5 w-5" strokeWidth={3} />
            </span>
            <div>
              <div className="text-base font-bold">Goal complete</div>
              <div className="text-[13px] text-muted-foreground">
                All {goal.groups.length} groups and {total} steps are done. Nice work.
              </div>
            </div>
          </div>
        )}

        {hasGroups ? (
          <>
            <SectionLabel>
              Groups · {goal.groups.length}
              {total > 0 && (
                <span className="font-medium normal-case tracking-normal text-muted-foreground/70">
                  {" "}
                  — {done}/{total} steps
                </span>
              )}
            </SectionLabel>
            <div className="grid grid-cols-1 items-stretch gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {goal.groups.map((group) => (
                <GroupCard key={group.id} goalId={goal.id} group={group} />
              ))}
              <AddGroupCard onClick={() => setAddGroupOpen(true)} />
            </div>
          </>
        ) : (
          <div className="mt-2 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border-strong px-5 py-14 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full border border-dashed border-border-strong text-2xl text-muted-foreground">
              +
            </span>
            <div className="text-[15px] font-bold">No groups yet</div>
            <p className="max-w-sm text-[13px] text-muted-foreground">
              Break this goal down into a few groups of steps to get started
            </p>
            <Button className="mt-2" onClick={() => setAddGroupOpen(true)}>
              + Add first group
            </Button>
          </div>
        )}
      </main>

      <NewGoalDialog open={newGoalOpen} onOpenChange={setNewGoalOpen} onCreate={handleCreateGoal} />
      <PromptDialog
        open={addGroupOpen}
        onOpenChange={setAddGroupOpen}
        title="Add group"
        description={<>Split &ldquo;{goal.title}&rdquo; into a new group of steps</>}
        label="Group name"
        placeholder="e.g. Editing & Mixing"
        submitLabel="Add group"
        onSubmit={(v) => addGroup(goal.id, v)}
      />
      <ShareDialog open={shareOpen} onOpenChange={setShareOpen} goal={goal} />
    </div>
  );
}
