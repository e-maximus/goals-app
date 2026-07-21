"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu } from "@base-ui/react/menu";
import { Check, MoreVertical, Pencil, Repeat, Target, Trash2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { useShallow } from "zustand/shallow";
import { isTaskDone, type Task } from "@/lib/types";
import { DueBadge, menuItemClass, menuItemDestructiveClass, menuPopupClass } from "@/components/ui-bits";
import { TaskDialog } from "@/components/task-dialog";
import { cn, goalHref } from "@/lib/utils";

/**
 * One task row, shared by the tasks page, the dashboard's Today block and the
 * goal page's tasks section. Mirrors StepRow: the whole row toggles, the
 * checkbox and the menu stop propagation. `showGoal` renders the linked goal
 * as a chip — off on the goal's own page, where the link is a given.
 */
export function TaskRow({
  task,
  showGoal = true,
  fixedGoalId,
}: {
  task: Task;
  showGoal?: boolean;
  /** Keeps the edit dialog locked to this goal (see TaskDialog). */
  fixedGoalId?: string;
}) {
  const { goals, toggleTask, editTask, deleteTask } = useStore(
    useShallow((s) => ({
      goals: s.goals,
      toggleTask: s.toggleTask,
      editTask: s.editTask,
      deleteTask: s.deleteTask,
    }))
  );
  const [editOpen, setEditOpen] = useState(false);

  const done = isTaskDone(task);
  const goal = task.goalId ? goals.find((g) => g.id === task.goalId) : undefined;

  return (
    <>
      <div
        onClick={() => toggleTask(task.id)}
        className="group/task flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-2 hover:bg-muted/60"
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleTask(task.id);
          }}
          className={cn(
            "mt-0.5 flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-full border-2 transition-colors",
            done
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border-strong hover:border-primary"
          )}
          aria-label={done ? "Mark task incomplete" : "Mark task complete"}
        >
          {done && <Check className="h-3 w-3" strokeWidth={3} />}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={cn("text-sm font-medium", done && "text-muted-foreground")}>
              {task.title}
            </span>
            {task.daily && (
              <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-secondary-foreground">
                <Repeat className="h-3 w-3" aria-hidden />
                daily
              </span>
            )}
            <DueBadge dueDate={task.daily ? undefined : task.dueDate} done={task.done} />
            {showGoal && goal && (
              <Link
                href={goalHref(goal)}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex max-w-48 flex-shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
              >
                <Target className="h-3 w-3 flex-shrink-0" aria-hidden />
                <span className="truncate">{goal.title}</span>
              </Link>
            )}
          </div>
          {task.description && (
            <div className={cn("mt-0.5 text-[13px] text-muted-foreground", done && "opacity-70")}>
              {task.description}
            </div>
          )}
        </div>

        <div onClick={(e) => e.stopPropagation()}>
          <Menu.Root>
            <Menu.Trigger
              aria-label="Task options"
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-muted-foreground opacity-0 transition-all hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover/task:opacity-100"
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
                  <Menu.Item onClick={() => deleteTask(task.id)} className={menuItemDestructiveClass}>
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete task
                  </Menu.Item>
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
        </div>
      </div>

      <TaskDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        title="Edit task"
        description="Rename this task, link it to a goal, or adjust when it's due."
        submitLabel="Save task"
        goals={goals}
        fixedGoalId={fixedGoalId}
        initialTitle={task.title}
        initialDescription={task.description ?? ""}
        initialGoalId={task.goalId}
        initialDaily={task.daily ?? false}
        initialDueDate={task.dueDate}
        onSubmit={(title, values) => editTask(task.id, title, values)}
      />
    </>
  );
}
