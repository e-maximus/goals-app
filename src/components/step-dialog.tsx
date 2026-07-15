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

/**
 * The two-field step form — a title and an optional description. Serves both
 * adding a step and editing one; they ask for exactly the same thing, so they
 * share a dialog rather than having two that drift apart. The title field keeps
 * the label "Step" so it reads naturally in both flows.
 */
export function StepDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  initialText = "",
  initialDescription = "",
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  submitLabel: string;
  initialText?: string;
  initialDescription?: string;
  onSubmit: (text: string, description?: string) => void;
}) {
  const [text, setText] = useState(initialText);
  const [desc, setDesc] = useState(initialDescription);

  // Reset fields each time the dialog transitions to open. Adjusting state during
  // render on a prop change is React's recommended pattern and avoids a
  // setState-in-effect cascade.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setText(initialText);
      setDesc(initialDescription);
    }
  }

  const submit = () => {
    if (!text.trim()) return;
    onSubmit(text, desc);
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
            <Label htmlFor="step-title">Step</Label>
            <Input
              id="step-title"
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. Record ep. 3"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="step-description">Description (optional)</Label>
            <Textarea
              id="step-description"
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
