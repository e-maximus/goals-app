"use client";

import { useCallback, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { Goal } from "@/lib/types";
import { goalProgress, groupProgress } from "@/lib/types";
import { Copy, Check } from "lucide-react";

type ShareMode = "text" | "json";

function formatGoalAsText(goal: Goal): string {
  const pct = goalProgress(goal);
  const lines: string[] = [];
  lines.push(`${goal.title} — ${pct}%`);
  lines.push("");

  for (const group of goal.groups) {
    const { pct: gpct } = groupProgress(group);
    lines.push(`${group.title} (${gpct === null ? 0 : gpct}%)`);
    for (const step of group.steps) {
      lines.push(`  ${step.done ? "[x]" : "[ ]"} ${step.text}`);
    }
    lines.push("");
  }

  // Trim trailing blank line
  while (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }

  return lines.join("\n");
}

export function ShareDialog({
  open,
  onOpenChange,
  goal,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goal: Goal | null;
}) {
  const [copied, setCopied] = useState(false);
  const [mode, setMode] = useState<ShareMode>("text");

  const shareContent = goal
    ? mode === "json"
      ? JSON.stringify(goal, null, 2)
      : formatGoalAsText(goal)
    : "";

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select the textarea content
      const textarea = document.querySelector<HTMLTextAreaElement>(
        "#share-json-textarea"
      );
      if (textarea) {
        textarea.select();
        document.execCommand("copy");
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    }
  }, [shareContent]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Share goal</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex gap-2">
            <Button
              variant={mode === "text" ? "default" : "outline"}
              onClick={() => setMode("text")}
            >
              Text
            </Button>
            <Button
              variant={mode === "json" ? "default" : "outline"}
              onClick={() => setMode("json")}
            >
              JSON
            </Button>
          </div>
          <Textarea
            id="share-json-textarea"
            value={shareContent}
            readOnly
            className="min-h-[200px] resize-y font-mono text-xs"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button onClick={handleCopy} disabled={copied}>
              {copied ? (
                <>
                  <Check className="h-4 w-4" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  Copy
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
