"use client";

import { useState } from "react";
import { Menu } from "@base-ui/react/menu";
import { groupProgress, type Group, type Step } from "@/lib/types";
import { DueBadge, menuItemClass, menuItemDestructiveClass, menuPopupClass } from "@/components/ui-bits";
import { GroupDialog } from "@/components/group-dialog";
import { StepDialog } from "@/components/step-dialog";
import { useStore } from "@/lib/store";
import { useShallow } from "zustand/shallow";
import { cn } from "@/lib/utils";
import { ArrowDown, ArrowUp, Check, ChevronDown, MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";

/**
 * One step row. The whole row is a toggle target: clicking anywhere on it
 * flips the step. The checkbox and the edit/delete buttons stop propagation so
 * they keep their own behaviour instead of doubling the toggle. Done steps go
 * muted (no strikethrough — finished work should still scan well); the next
 * actionable step is highlighted with a badge and its own Done button.
 */
export function StepRow({
  step,
  isNext,
  card = false,
  onToggle,
  onEdit,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  step: Step;
  isNext: boolean;
  /**
   * Render as a standalone card (the goal's top-level steps) rather than a
   * light row (the steps nested inside a group). Same content either way.
   */
  card?: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  /** Reorder handlers; absent (e.g. at the edge of the list) disables the item. */
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  return (
    <div
      onClick={onToggle}
      className={cn(
        "group/step flex cursor-pointer items-start gap-2.5",
        card
          ? cn(
              "rounded-xl border bg-card px-3.5 py-3 shadow-sm transition-colors",
              isNext ? "border-primary/40 bg-secondary/50" : "border-border hover:border-border-strong"
            )
          : cn(
              "rounded-lg px-2 py-2 hover:bg-muted/60",
              isNext && "bg-secondary/70 hover:bg-secondary"
            )
      )}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
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
            step.done && "text-muted-foreground"
          )}
        >
          {step.text}
          {isNext && (
            <span className="ml-2 inline-block rounded-full bg-primary px-1.5 py-px align-[2px] text-[10px] font-bold uppercase tracking-wide text-primary-foreground">
              next
            </span>
          )}
        </div>
        {step.description && (
          <p className="mt-0.5 whitespace-pre-line text-xs leading-snug text-muted-foreground">
            {step.description}
          </p>
        )}
      </div>
      <DueBadge dueDate={step.dueDate} done={step.done} className="mt-0.5" />
      {isNext && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          className="mt-0.5 flex-shrink-0 rounded-md border border-border bg-card px-2 py-0.5 text-xs font-semibold text-foreground transition-colors hover:border-primary"
        >
          Done
        </button>
      )}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onEdit();
        }}
        className="mt-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/step:opacity-100"
        aria-label="Edit step"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="mt-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover/step:opacity-100"
        aria-label="Delete step"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
      <Menu.Root>
        <Menu.Trigger
          aria-label="Step options"
          onClick={(e) => e.stopPropagation()}
          className="mt-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 data-[popup-open]:opacity-100 group-hover/step:opacity-100"
        >
          <MoreVertical className="h-3.5 w-3.5" />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner side="bottom" align="end" sideOffset={6} className="z-50">
            <Menu.Popup className={menuPopupClass}>
              <Menu.Item disabled={!onMoveUp} onClick={onMoveUp} className={menuItemClass}>
                <ArrowUp className="h-3.5 w-3.5 text-muted-foreground" />
                Move up
              </Menu.Item>
              <Menu.Item disabled={!onMoveDown} onClick={onMoveDown} className={menuItemClass}>
                <ArrowDown className="h-3.5 w-3.5 text-muted-foreground" />
                Move down
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </div>
  );
}

/**
 * Presentational group card. It owns no data — the current `group` and every
 * mutation come in as props, so it renders anywhere (Storybook/tests) without a
 * store. `GroupCardConnected` below wires it to the app store.
 *
 * When `collapsible`, the card can fold to a header-only row (the hybrid
 * layout keeps only the active group open). `nextStepId` highlights the one
 * step to do next.
 */
export function GroupCard({
  group,
  collapsible = false,
  collapsed = false,
  onToggleCollapse,
  nextStepId,
  onToggleStep,
  onAddStep,
  onEditStep,
  onDeleteStep,
  onRenameGroup,
  onDeleteGroup,
  onMoveUp,
  onMoveDown,
  onMoveStep,
}: {
  group: Group;
  collapsible?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  nextStepId?: string | null;
  onToggleStep: (stepId: string) => void;
  onAddStep: (text: string, description?: string, dueDate?: number) => void;
  onEditStep: (stepId: string, text: string, description?: string, dueDate?: number) => void;
  onDeleteStep: (stepId: string) => void;
  onRenameGroup: (title: string, dueDate?: number) => void;
  onDeleteGroup: () => void;
  /** Reorder the group among its siblings; absent at the edge of the list. */
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  /** Reorder a step within this group. Optional so Storybook can omit it. */
  onMoveStep?: (stepId: string, delta: -1 | 1) => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  // The step currently being edited — also drives the edit dialog's open state.
  const [editingStep, setEditingStep] = useState<Step | null>(null);
  const { done, total, pct } = groupProgress(group);
  const complete = pct === 100;
  const folded = collapsible && collapsed;

  return (
    <div
      className={cn(
        "group/card flex flex-col rounded-2xl border border-border bg-card shadow-sm transition-colors",
        complete && "border-primary/60"
      )}
    >
      <div className={cn("relative px-4 pb-3.5 pt-4", !folded && "border-b border-border")}>
        <div
          className={cn("mb-2.5 flex items-center justify-between gap-2", folded && "mb-0")}
          onClick={collapsible ? onToggleCollapse : undefined}
          role={collapsible ? "button" : undefined}
          aria-expanded={collapsible ? !collapsed : undefined}
          aria-label={collapsible ? `${collapsed ? "Expand" : "Collapse"} ${group.title}` : undefined}
        >
          <h3 className={cn("truncate text-[15px] font-bold", collapsible && "cursor-pointer")}>
            {complete && (
              <Check
                className="mr-1.5 inline-block h-4 w-4 align-[-2px] text-primary"
                strokeWidth={3}
                aria-hidden
              />
            )}
            {group.title}
          </h3>
          <div className="mr-6 flex flex-shrink-0 items-center gap-2">
            <DueBadge dueDate={group.dueDate} done={complete} />
            <span
              className={cn(
                "rounded-full bg-muted px-2.5 py-0.5 text-xs font-bold tabular-nums text-muted-foreground",
                complete && "bg-primary text-primary-foreground"
              )}
            >
              {total === 0 ? "—" : `${done}/${total}`}
            </span>
            {collapsible && (
              <ChevronDown
                className={cn(
                  "h-4 w-4 text-muted-foreground transition-transform",
                  !collapsed && "rotate-180"
                )}
                aria-hidden
              />
            )}
          </div>
        </div>

        {/* Options menu floats in the card corner so the count badge can sit
            flush against the right edge. On large screens it's revealed on
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
              <Menu.Popup className={menuPopupClass}>
                <Menu.Item
                  onClick={() => setRenameOpen(true)}
                  className={menuItemClass}
                >
                  <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                  Rename
                </Menu.Item>
                <Menu.Item disabled={!onMoveUp} onClick={onMoveUp} className={menuItemClass}>
                  <ArrowUp className="h-3.5 w-3.5 text-muted-foreground" />
                  Move up
                </Menu.Item>
                <Menu.Item disabled={!onMoveDown} onClick={onMoveDown} className={menuItemClass}>
                  <ArrowDown className="h-3.5 w-3.5 text-muted-foreground" />
                  Move down
                </Menu.Item>
                <Menu.Item onClick={onDeleteGroup} className={menuItemDestructiveClass}>
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete group
                </Menu.Item>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      </div>

      {!folded && (
        <>
          <div className="flex max-h-72 flex-1 flex-col gap-0.5 overflow-y-auto px-2.5 py-2">
            {group.steps.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-1.5 px-4 py-7 text-center">
                <div className="text-[13px] font-semibold text-foreground">No steps yet</div>
                <div className="text-xs text-muted-foreground">Break this group down into steps</div>
              </div>
            ) : (
              group.steps.map((step, i) => (
                <StepRow
                  key={step.id}
                  step={step}
                  isNext={step.id === nextStepId}
                  onToggle={() => onToggleStep(step.id)}
                  onEdit={() => setEditingStep(step)}
                  onDelete={() => onDeleteStep(step.id)}
                  onMoveUp={onMoveStep && i > 0 ? () => onMoveStep(step.id, -1) : undefined}
                  onMoveDown={
                    onMoveStep && i < group.steps.length - 1
                      ? () => onMoveStep(step.id, 1)
                      : undefined
                  }
                />
              ))
            )}
          </div>

          <div className="flex-shrink-0 px-2.5 pb-3 pt-0.5">
            <button
              onClick={() => setAddOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border-strong px-2.5 py-1.5 text-[13px] text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" />
              Add step
            </button>
          </div>
        </>
      )}

      <StepDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Add step"
        description={<>Add a step to &ldquo;{group.title}&rdquo;</>}
        submitLabel="Add step"
        onSubmit={(text, description, dueDate) => onAddStep(text, description, dueDate)}
      />

      <GroupDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        title="Rename group"
        submitLabel="Save"
        initialTitle={group.title}
        initialDueDate={group.dueDate}
        onSubmit={(title, dueDate) => onRenameGroup(title, dueDate)}
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
        initialDueDate={editingStep?.dueDate}
        onSubmit={(text, description, dueDate) => {
          if (editingStep) onEditStep(editingStep.id, text, description, dueDate);
        }}
      />
    </div>
  );
}

/**
 * Store-connected wrapper: binds the presentational `GroupCard` to the app
 * store. This is what the app renders; Storybook renders `GroupCard` directly.
 */
export function GroupCardConnected({
  goalId,
  group,
  collapsible,
  collapsed,
  onToggleCollapse,
  nextStepId,
}: {
  goalId: string;
  group: Group;
  collapsible?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  nextStepId?: string | null;
}) {
  const { toggleStep, addStep, editStep, deleteStep, renameGroup, deleteGroup, moveGroup, moveStep } =
    useStore(
      useShallow((s) => ({
        toggleStep: s.toggleStep,
        addStep: s.addStep,
        editStep: s.editStep,
        deleteStep: s.deleteStep,
        renameGroup: s.renameGroup,
        deleteGroup: s.deleteGroup,
        moveGroup: s.moveGroup,
        moveStep: s.moveStep,
      }))
    );
  // The group's position among its siblings gates the Move up/down items.
  const groupCount = useStore((s) => s.goals.find((g) => g.id === goalId)?.groups.length ?? 0);
  const groupIndex = useStore(
    (s) => s.goals.find((g) => g.id === goalId)?.groups.findIndex((gr) => gr.id === group.id) ?? -1
  );
  return (
    <GroupCard
      group={group}
      collapsible={collapsible}
      collapsed={collapsed}
      onToggleCollapse={onToggleCollapse}
      nextStepId={nextStepId}
      onToggleStep={(stepId) => toggleStep(goalId, group.id, stepId)}
      onAddStep={(text, description, dueDate) =>
        addStep(goalId, group.id, text, description, dueDate)
      }
      onEditStep={(stepId, text, description, dueDate) =>
        editStep(goalId, group.id, stepId, text, description, dueDate)
      }
      onDeleteStep={(stepId) => deleteStep(goalId, group.id, stepId)}
      onRenameGroup={(title, dueDate) => renameGroup(goalId, group.id, title, dueDate)}
      onDeleteGroup={() => deleteGroup(goalId, group.id)}
      onMoveUp={groupIndex > 0 ? () => moveGroup(goalId, group.id, -1) : undefined}
      onMoveDown={
        groupIndex >= 0 && groupIndex < groupCount - 1
          ? () => moveGroup(goalId, group.id, 1)
          : undefined
      }
      onMoveStep={(stepId, delta) => moveStep(goalId, group.id, stepId, delta)}
    />
  );
}

/**
 * The goal's own steps, outside any group — each rendered as its own sortable
 * card above the groups. Store-connected with `groupId = null`. Adding a step
 * lives in the goal page's bottom action row, so there's no inline add button
 * here; this list owns only the per-step edit dialog. Returns a fragment so the
 * cards slot straight into the page's step stack and share its spacing.
 */
export function UngroupedStepsList({
  goalId,
  steps,
  nextStepId,
}: {
  goalId: string;
  steps: Step[];
  nextStepId?: string | null;
}) {
  const { toggleStep, editStep, deleteStep, moveStep } = useStore(
    useShallow((s) => ({
      toggleStep: s.toggleStep,
      editStep: s.editStep,
      deleteStep: s.deleteStep,
      moveStep: s.moveStep,
    }))
  );
  const [editingStep, setEditingStep] = useState<Step | null>(null);

  return (
    <>
      {steps.map((step, i) => (
        <StepRow
          key={step.id}
          card
          step={step}
          isNext={step.id === nextStepId}
          onToggle={() => toggleStep(goalId, null, step.id)}
          onEdit={() => setEditingStep(step)}
          onDelete={() => deleteStep(goalId, null, step.id)}
          onMoveUp={i > 0 ? () => moveStep(goalId, null, step.id, -1) : undefined}
          onMoveDown={i < steps.length - 1 ? () => moveStep(goalId, null, step.id, 1) : undefined}
        />
      ))}

      <StepDialog
        key={editingStep?.id}
        open={editingStep !== null}
        onOpenChange={(open) => {
          if (!open) setEditingStep(null);
        }}
        title="Edit step"
        submitLabel="Save"
        initialText={editingStep?.text ?? ""}
        initialDescription={editingStep?.description ?? ""}
        initialDueDate={editingStep?.dueDate}
        onSubmit={(text, description, dueDate) => {
          if (editingStep) editStep(goalId, null, editingStep.id, text, description, dueDate);
        }}
      />
    </>
  );
}

/** The compact dashed row that closes the groups stack. */
export function AddGroupCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-center gap-2.5 rounded-2xl border border-dashed border-border-strong px-4 py-3.5 text-sm font-semibold text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
    >
      <Plus className="h-4 w-4" />
      Add group
    </button>
  );
}
