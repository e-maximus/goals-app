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
import { Textarea } from "@/components/ui/textarea";

// Single-field modal used for "Add group", "Add step" and "Edit comment".
export function PromptDialog({
  open,
  onOpenChange,
  title,
  description,
  label,
  placeholder,
  hint,
  submitLabel,
  initialValue = "",
  multiline = false,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  label: string;
  placeholder?: string;
  hint?: string;
  submitLabel: string;
  // Prefill the field when the dialog opens (e.g. the current name for a
  // rename). Defaults to empty for the "add" flows.
  initialValue?: string;
  // Swap the single-line input for a textarea. Names and step titles are one
  // line; comment bodies are not.
  multiline?: boolean;
  onSubmit: (value: string) => void;
}) {
  const [value, setValue] = useState(initialValue);

  // Reset the field each time the dialog transitions to open. Adjusting state
  // during render on a prop change is React's recommended pattern and avoids a
  // setState-in-effect cascade.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setValue(initialValue);
  }

  const submit = () => {
    if (!value.trim()) return;
    onSubmit(value);
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
            <Label htmlFor="prompt-input">{label}</Label>
            {multiline ? (
              <Textarea
                id="prompt-input"
                autoFocus
                rows={4}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={placeholder}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    submit();
                  }
                }}
              />
            ) : (
              <Input
                id="prompt-input"
                autoFocus
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={placeholder}
              />
            )}
            {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!value.trim()}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
