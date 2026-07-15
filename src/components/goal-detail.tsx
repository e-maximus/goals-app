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
import { LoadError } from "@/components/load-error";
import { GoalDialog, NewGoalDialog } from "@/components/new-goal-dialog";
import { PromptDialog } from "@/components/prompt-dialog";
import { GroupCardConnected, AddGroupCard } from "@/components/group-card";
import { GoalBanner } from "@/components/goal-banner";
import { CommentsSection } from "@/components/comments-section";
import { LoadingState, SectionLabel } from "@/components/ui-bits";
import { Button, buttonVariants } from "@/components/ui/button";
import { Check } from "lucide-react";
import { ShareDialog } from "@/components/share-dialog";

export function GoalDetail({ goalId }: { goalId: string }) {
  const goal = useStore((s) => s.goals.find((g) => g.id === goalId));
  const loadStatus = useStore((s) => s.loadStatus);
  const addGoal = useStore((s) => s.addGoal);
  const updateGoal = useStore((s) => s.updateGoal);
  const addGroup = useStore((s) => s.addGroup);
  const deleteGoal = useStore((s) => s.deleteGoal);
  const router = useRouter();
  const [newGoalOpen, setNewGoalOpen] = useState(false);
  const [editGoalOpen, setEditGoalOpen] = useState(false);
  const [addGroupOpen, setAddGroupOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const handleCreateGoal = (title: string, why?: string) => {
    const g = addGoal(title, why);
    router.push(`/goal?id=${g.id}`);
  };

  const openNewGoal = () => setNewGoalOpen(true);

  if (loadStatus === "loading") {
    return (
      <div className="flex flex-1 flex-col">
        <Topbar crumbs={<Crumbs goalTitle="…" />} onNewGoal={openNewGoal} showShare />
        <LoadingState label="Loading goal…" />
      </div>
    );
  }

  if (loadStatus === "error") {
    return (
      <div className="flex flex-1 flex-col">
        <Topbar crumbs={<Crumbs />} onNewGoal={openNewGoal} />
        <LoadError />
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
  const groupWord = goal.groups.length === 1 ? "group" : "groups";
  const stepWord = total === 1 ? "step" : "steps";

  return (
    <div className="flex flex-1 flex-col">
      <Topbar crumbs={<Crumbs goalTitle={goal.title} />} onNewGoal={openNewGoal} showShare onShare={() => setShareOpen(true)} />

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 sm:px-10">
        {/* Goal banner */}
        <div className="mb-7">
          <GoalBanner
            title={goal.title}
            why={goal.why}
            pct={pct}
            onEdit={() => setEditGoalOpen(true)}
            onDelete={() => {
              deleteGoal(goal.id);
              router.push("/");
            }}
          />
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
                All {goal.groups.length} {groupWord} and {total} {stepWord} are done. Nice work.
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
                <GroupCardConnected key={group.id} goalId={goal.id} group={group} />
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

        <CommentsSection goalId={goal.id} comments={goal.comments ?? []} />
      </main>

      <NewGoalDialog open={newGoalOpen} onOpenChange={setNewGoalOpen} onCreate={handleCreateGoal} />
      <GoalDialog
        open={editGoalOpen}
        onOpenChange={setEditGoalOpen}
        heading="Edit goal"
        description="Rename this goal, or change why it matters."
        submitLabel="Save goal"
        initialTitle={goal.title}
        initialWhy={goal.why ?? ""}
        onSubmit={(title, why) => updateGoal(goal.id, title, why)}
      />
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
