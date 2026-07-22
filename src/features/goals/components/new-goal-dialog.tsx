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

/**
 * The goal form — name, the optional "why", and an optional due date. Serves
 * both creating a goal and editing one; they ask for exactly the same thing,
 * so they share a dialog rather than having two that drift apart.
 */
export function GoalDialog({
  open,
  onOpenChange,
  heading,
  description,
  submitLabel,
  initialTitle = "",
  initialWhy = "",
  initialDueDate,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  heading: string;
  description: string;
  submitLabel: string;
  initialTitle?: string;
  initialWhy?: string;
  initialDueDate?: number;
  onSubmit: (title: string, why?: string, dueDate?: number) => void;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [why, setWhy] = useState(initialWhy);
  const [dueDate, setDueDate] = useState<number | undefined>(initialDueDate);

  // Reset fields each time the dialog transitions to open. Adjusting state during
  // render on a prop change is React's recommended pattern and avoids a
  // setState-in-effect cascade.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setTitle(initialTitle);
      setWhy(initialWhy);
      setDueDate(initialDueDate);
    }
  }

  const submit = () => {
    if (!title.trim()) return;
    onSubmit(title, why, dueDate);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{heading}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="goal-name">Goal name</Label>
            <Input
              id="goal-name"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Run a half marathon"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="goal-why">Why it matters (optional)</Label>
            <Textarea
              id="goal-why"
              value={why}
              onChange={(e) => setWhy(e.target.value)}
              placeholder="e.g. Prove to myself I can stick with something for months"
              className="resize-none"
            />
          </div>
          <DueDateField value={dueDate} onChange={setDueDate} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!title.trim()}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function NewGoalDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (title: string, why?: string, dueDate?: number) => void;
}) {
  return (
    <GoalDialog
      open={open}
      onOpenChange={onOpenChange}
      heading="New goal"
      description="What do you want to achieve?"
      submitLabel="Create goal"
      onSubmit={onCreate}
    />
  );
}
