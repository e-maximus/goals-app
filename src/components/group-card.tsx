"use client";

import { useState } from "react";
import { groupProgress, type Group } from "@/lib/types";
import { ProgressBar } from "@/components/ui-bits";
import { PromptDialog } from "@/components/prompt-dialog";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Check, Plus, Trash2 } from "lucide-react";

/**
 * Presentational group card. It owns no data — the current `group` and every
 * mutation come in as props, so it renders anywhere (Storybook/tests) without a
 * store. `GroupCardConnected` below wires it to the app store.
 */
export function GroupCard({
  group,
  onToggleStep,
  onAddStep,
  onDeleteStep,
  onDeleteGroup,
}: {
  group: Group;
  onToggleStep: (stepId: string) => void;
  onAddStep: (text: string) => void;
  onDeleteStep: (stepId: string) => void;
  onDeleteGroup: () => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const { pct } = groupProgress(group);
  const complete = pct === 100;

  return (
    <div
      className={cn(
        "group/card flex h-full flex-col rounded-2xl border border-border bg-card shadow-sm transition-colors",
        complete && "border-primary/60"
      )}
    >
      <div className="border-b border-border px-4 pb-3.5 pt-4">
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <h3 className="truncate text-[15px] font-bold">{group.title}</h3>
          <div className="flex flex-shrink-0 items-center gap-1.5">
            <span
              className={cn(
                "rounded-full bg-muted px-2.5 py-0.5 text-xs font-bold tabular-nums text-muted-foreground",
                complete && "bg-primary text-primary-foreground"
              )}
            >
              {pct === null ? "—" : `${pct}%`}
            </span>
            <button
              onClick={onDeleteGroup}
              className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover/card:opacity-100"
              aria-label="Delete group"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <ProgressBar value={pct ?? 0} className="h-1.5" />
      </div>

      <div className="flex max-h-56 flex-1 flex-col gap-0.5 overflow-y-auto px-2.5 py-2">
        {group.steps.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-1.5 px-4 py-7 text-center">
            <div className="text-[13px] font-semibold text-foreground">No steps yet</div>
            <div className="text-xs text-muted-foreground">Break this group down into steps</div>
          </div>
        ) : (
          group.steps.map((step) => (
            <div
              key={step.id}
              className="group/step flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-muted/60"
            >
              <button
                onClick={() => onToggleStep(step.id)}
                className={cn(
                  "flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                  step.done
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border-strong hover:border-primary"
                )}
                aria-label={step.done ? "Mark step incomplete" : "Mark step complete"}
              >
                {step.done && <Check className="h-3 w-3" strokeWidth={3} />}
              </button>
              <span
                className={cn(
                  "flex-1 text-[13.5px]",
                  step.done && "text-muted-foreground line-through decoration-border-strong"
                )}
              >
                {step.text}
              </span>
              <button
                onClick={() => onDeleteStep(step.id)}
                className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover/step:opacity-100"
                aria-label="Delete step"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))
        )}
      </div>

      <div className="flex-shrink-0 px-2.5 pb-3 pt-0.5">
        <button
          onClick={() => setAddOpen(true)}
          className="flex w-full items-center gap-2.5 rounded-lg border border-dashed border-border-strong px-2 py-2 text-[13px] text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
          Add step
        </button>
      </div>

      <PromptDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Add step"
        description={<>Add a step to &ldquo;{group.title}&rdquo;</>}
        label="Step"
        placeholder="e.g. Record ep. 3"
        hint="Keep it small — something you could do in one sitting."
        submitLabel="Add step"
        onSubmit={(v) => onAddStep(v)}
      />
    </div>
  );
}

/**
 * Store-connected wrapper: binds the presentational `GroupCard` to the app
 * store. This is what the app renders; Storybook renders `GroupCard` directly.
 */
export function GroupCardConnected({ goalId, group }: { goalId: string; group: Group }) {
  const { toggleStep, addStep, deleteStep, deleteGroup } = useStore();
  return (
    <GroupCard
      group={group}
      onToggleStep={(stepId) => toggleStep(goalId, group.id, stepId)}
      onAddStep={(text) => addStep(goalId, group.id, text)}
      onDeleteStep={(stepId) => deleteStep(goalId, group.id, stepId)}
      onDeleteGroup={() => deleteGroup(goalId, group.id)}
    />
  );
}

export function AddGroupCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border-strong p-4 text-sm font-semibold text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-full border border-dashed border-border-strong text-lg">
        +
      </span>
      Add group
    </button>
  );
}
