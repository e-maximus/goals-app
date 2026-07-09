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
import { Textarea } from "@/components/ui/textarea";
import { useStore } from "@/lib/store";

export function ImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { importGoal } = useStore();
  const [jsonText, setJsonText] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Reset state each time the dialog transitions to open.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setJsonText("");
      setError(null);
    }
  }

  const submit = () => {
    if (!jsonText.trim()) return;
    const result = importGoal(jsonText.trim());
    if (result) {
      setJsonText("");
      setError(null);
      onOpenChange(false);
    } else {
      setError("Invalid JSON. Check format and required fields.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import goal</DialogTitle>
          <DialogDescription>
            Paste the JSON of a goal to add it to your list.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Textarea
            value={jsonText}
            onChange={(e) => {
              setJsonText(e.target.value);
              if (error) setError(null);
            }}
            placeholder="Paste goal JSON here…"
            className="min-h-[200px] resize-y font-mono text-xs"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={!jsonText.trim()}>
              Import
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
