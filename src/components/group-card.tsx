"use client";

import { useState } from "react";
import { Menu } from "@base-ui/react/menu";
import { groupProgress, type Group, type Step } from "@/lib/types";
import { ProgressBar } from "@/components/ui-bits";
import { PromptDialog } from "@/components/prompt-dialog";
import { StepDialog } from "@/components/step-dialog";
import { useStore } from "@/lib/store";
import { useShallow } from "zustand/shallow";
import { cn } from "@/lib/utils";
import { Check, MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";

/**
 * Presentational group card. It owns no data — the current `group` and every
 * mutation come in as props, so it renders anywhere (Storybook/tests) without a
 * store. `GroupCardConnected` below wires it to the app store.
 */
export function GroupCard({
  group,
  onToggleStep,
  onAddStep,
  onEditStep,
  onDeleteStep,
  onRenameGroup,
  onDeleteGroup,
}: {
  group: Group;
  onToggleStep: (stepId: string) => void;
  onAddStep: (text: string, description?: string) => void;
  onEditStep: (stepId: string, text: string, description?: string) => void;
  onDeleteStep: (stepId: string) => void;
  onRenameGroup: (title: string) => void;
  onDeleteGroup: () => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  // The step currently being edited — also drives the edit dialog's open state.
  const [editingStep, setEditingStep] = useState<Step | null>(null);
  const { pct } = groupProgress(group);
  const complete = pct === 100;

  return (
    <div
      className={cn(
        "group/card flex h-full flex-col rounded-2xl border border-border bg-card shadow-sm transition-colors",
        complete && "border-primary/60"
      )}
    >
      <div className="relative border-b border-border px-4 pb-3.5 pt-4">
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <h3 className="truncate text-[15px] font-bold">{group.title}</h3>
          <span
            className={cn(
              "flex-shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-xs font-bold tabular-nums text-muted-foreground",
              complete && "bg-primary text-primary-foreground"
            )}
          >
            {pct === null ? "—" : `${pct}%`}
          </span>
        </div>
        <ProgressBar value={pct ?? 0} className="h-1.5" />

        {/* Options menu floats in the card corner so the percentage badge can
            sit flush against the right edge. On large screens it's revealed on
            hover (or focus / while open); on phones and tablets — which have no
            hover — it stays visible. */}
        <Menu.Root>
          <Menu.Trigger
            aria-label="Group options"
            className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full border border-border bg-card text-muted-foreground opacity-100 shadow-sm transition-opacity hover:text-foreground focus-visible:opacity-100 data-[popup-open]:opacity-100 lg:opacity-0 lg:group-hover/card:opacity-100"
          >
            <MoreVertical className="h-4 w-4" />
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner side="bottom" align="end" sideOffset={6} className="z-50">
              <Menu.Popup className="min-w-40 rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-md outline-none">
                <Menu.Item
                  onClick={() => setRenameOpen(true)}
                  className="flex cursor-default items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] outline-none data-[highlighted]:bg-muted"
                >
                  <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                  Rename
                </Menu.Item>
                <Menu.Item
                  onClick={onDeleteGroup}
                  className="flex cursor-default items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-destructive outline-none data-[highlighted]:bg-destructive/10"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete group
                </Menu.Item>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      </div>

      <div className="flex max-h-72 flex-1 flex-col gap-0.5 overflow-y-auto px-2.5 py-2">
        {group.steps.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-1.5 px-4 py-7 text-center">
            <div className="text-[13px] font-semibold text-foreground">No steps yet</div>
            <div className="text-xs text-muted-foreground">Break this group down into steps</div>
          </div>
        ) : (
          group.steps.map((step) => (
            <div
              key={step.id}
              className="group/step flex items-start gap-2.5 rounded-lg px-2 py-2 hover:bg-muted/60"
            >
              <button
                onClick={() => onToggleStep(step.id)}
                className={cn(
                  "mt-0.5 flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                  step.done
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border-strong hover:border-primary"
                )}
                aria-label={step.done ? "Mark step incomplete" : "Mark step complete"}
              >
                {step.done && <Check className="h-3 w-3" strokeWidth={3} />}
              </button>
              <div className="min-w-0 flex-1">
                <div
                  className={cn(
                    "text-[13.5px] font-medium",
                    step.done && "text-muted-foreground line-through decoration-border-strong"
                  )}
                >
                  {step.text}
                </div>
                {step.description && (
                  <p
                    className={cn(
                      "mt-0.5 whitespace-pre-line text-xs leading-snug text-muted-foreground",
                      step.done && "line-through decoration-border-strong"
                    )}
                  >
                    {step.description}
                  </p>
                )}
              </div>
              <button
                onClick={() => setEditingStep(step)}
                className="mt-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/step:opacity-100"
                aria-label="Edit step"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => onDeleteStep(step.id)}
                className="mt-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover/step:opacity-100"
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

      <StepDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Add step"
        description={<>Add a step to &ldquo;{group.title}&rdquo;</>}
        submitLabel="Add step"
        onSubmit={(text, description) => onAddStep(text, description)}
      />

      <PromptDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        title="Rename group"
        label="Group name"
        placeholder="e.g. Research"
        submitLabel="Save"
        initialValue={group.title}
        onSubmit={(v) => onRenameGroup(v)}
      />

      <StepDialog
        // Keyed by step so the dialog remounts with the right prefill when a
        // different step is picked.
        key={editingStep?.id}
        open={editingStep !== null}
        onOpenChange={(open) => {
          if (!open) setEditingStep(null);
        }}
        title="Edit step"
        submitLabel="Save"
        initialText={editingStep?.text ?? ""}
        initialDescription={editingStep?.description ?? ""}
        onSubmit={(text, description) => {
          if (editingStep) onEditStep(editingStep.id, text, description);
        }}
      />
    </div>
  );
}

/**
 * Store-connected wrapper: binds the presentational `GroupCard` to the app
 * store. This is what the app renders; Storybook renders `GroupCard` directly.
 */
export function GroupCardConnected({ goalId, group }: { goalId: string; group: Group }) {
  const { toggleStep, addStep, editStep, deleteStep, renameGroup, deleteGroup } = useStore(
    useShallow((s) => ({
      toggleStep: s.toggleStep,
      addStep: s.addStep,
      editStep: s.editStep,
      deleteStep: s.deleteStep,
      renameGroup: s.renameGroup,
      deleteGroup: s.deleteGroup,
    }))
  );
  return (
    <GroupCard
      group={group}
      onToggleStep={(stepId) => toggleStep(goalId, group.id, stepId)}
      onAddStep={(text, description) => addStep(goalId, group.id, text, description)}
      onEditStep={(stepId, text, description) =>
        editStep(goalId, group.id, stepId, text, description)
      }
      onDeleteStep={(stepId) => deleteStep(goalId, group.id, stepId)}
      onRenameGroup={(title) => renameGroup(goalId, group.id, title)}
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
