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
import { Label } from "@/components/ui/label";
import { DueDateField } from "@/components/due-date-field";

/**
 * The group form — a name and an optional due date. Serves both adding a group
 * and renaming one (they ask for the same thing), replacing the generic
 * PromptDialog those flows used before groups had deadlines.
 */
export function GroupDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  initialTitle = "",
  initialDueDate,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  submitLabel: string;
  initialTitle?: string;
  initialDueDate?: number;
  onSubmit: (title: string, dueDate?: number) => void;
}) {
  const [name, setName] = useState(initialTitle);
  const [dueDate, setDueDate] = useState<number | undefined>(initialDueDate);

  // Reset fields each time the dialog transitions to open. Adjusting state during
  // render on a prop change is React's recommended pattern and avoids a
  // setState-in-effect cascade.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName(initialTitle);
      setDueDate(initialDueDate);
    }
  }

  const submit = () => {
    if (!name.trim()) return;
    onSubmit(name, dueDate);
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
            <Label htmlFor="group-name">Group name</Label>
            <Input
              id="group-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Editing & Mixing"
            />
          </div>
          <DueDateField value={dueDate} onChange={setDueDate} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim()}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
