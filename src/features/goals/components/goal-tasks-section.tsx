"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { useStore } from "@/lib/store";
import { SectionLabel } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { TaskDialog, TaskRow } from "@/features/tasks";

/**
 * The tasks tied to this goal — the day-to-day to-dos living next to the plan.
 * They never feed the goal's progress; that stays derived from steps alone.
 */
export function GoalTasksSection({ goalId }: { goalId: string }) {
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
