"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { DueDateField } from "@/components/due-date-field";
import type { Goal } from "@/lib/types";

export type TaskFormValues = {
  description?: string;
  goalId?: string;
  daily?: boolean;
  dueDate?: number;
};

/**
 * The task form — a title, an optional description, an optional goal link, a
 * daily toggle, and an optional due date. Serves both adding a task and
 * editing one, like the step dialog. When `fixedGoalId` is set (adding from a
 * goal's page) the goal select is hidden and the link is a given.
 */
export function TaskDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  goals,
  fixedGoalId,
  initialTitle = "",
  initialDescription = "",
  initialGoalId,
  initialDaily = false,
  initialDueDate,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  submitLabel: string;
  /** The goals offered by the "linked goal" select. */
  goals: Goal[];
  /** Lock the task to this goal and hide the select. */
  fixedGoalId?: string;
  initialTitle?: string;
  initialDescription?: string;
  initialGoalId?: string;
  initialDaily?: boolean;
  initialDueDate?: number;
  onSubmit: (title: string, values: TaskFormValues) => void;
}) {
  const [text, setText] = useState(initialTitle);
  const [desc, setDesc] = useState(initialDescription);
  const [goalId, setGoalId] = useState(initialGoalId ?? "");
  const [daily, setDaily] = useState(initialDaily);
  const [dueDate, setDueDate] = useState<number | undefined>(initialDueDate);

  // Reset fields each time the dialog transitions to open (see StepDialog).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setText(initialTitle);
      setDesc(initialDescription);
      setGoalId(initialGoalId ?? "");
      setDaily(initialDaily);
      setDueDate(initialDueDate);
    }
  }

  const submit = () => {
    if (!text.trim()) return;
    onSubmit(text, {
      description: desc,
      goalId: fixedGoalId ?? (goalId || undefined),
      daily,
      // A daily task recurs — a deadline doesn't apply to it.
      dueDate: daily ? undefined : dueDate,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="task-title">Task</Label>
            <Input
              id="task-title"
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. Answer the editor's email"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="task-description">Description (optional)</Label>
            <Textarea
              id="task-description"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Add detail, context, or a link — anything that helps."
              className="resize-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  submit();
                }
              }}
            />
          </div>
          {!fixedGoalId && (
            <div className="space-y-2">
              <Label htmlFor="task-goal">Linked goal (optional)</Label>
              <select
                id="task-goal"
                value={goalId}
                onChange={(e) => setGoalId(e.target.value)}
                className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm"
              >
                <option value="">No goal</option>
                {goals.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                  </option>
                ))}
              </select>
            </div>
          )}
          <label className="flex items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={daily}
              onChange={(e) => setDaily(e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            <span className="font-medium">Daily</span>
            <span className="text-muted-foreground">— repeats every day</span>
          </label>
          {!daily && <DueDateField value={dueDate} onChange={setDueDate} />}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!text.trim()}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
