"use client";

import { useMemo, useState } from "react";
import { Menu } from "@base-ui/react/menu";
import { useStore } from "@/lib/store";
import { useShallow } from "zustand/shallow";
import type { Group, Note } from "@/lib/types";
import { SectionLabel } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CornerDownRight, MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";

const DAY = 1000 * 60 * 60 * 24;

// How many notes are shown before the "Load more" button appears, and how many
// each press reveals. The list also lives in a height-capped, scrollable
// container, so once more than this are loaded they scroll in place.
const PAGE_SIZE = 7;

function formatWhen(createdAt: number): string {
  const days = Math.floor((Date.now() - createdAt) / DAY);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return new Date(createdAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/** Flat lookup from a step id to its label — for showing a note's link. */
function stepLabels(groups: Group[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const group of groups) {
    for (const step of group.steps) map.set(step.id, step.text);
  }
  return map;
}

/**
 * The note composer/editor: a textarea plus an optional link to one step
 * ("sub-goal") of the goal. Owns its own draft state; `onSubmit` gets the text
 * and the chosen step id (empty string when none). Used both for the always-on
 * composer (which resets after each add) and the edit dialog.
 */
function NoteForm({
  groups,
  initialText = "",
  initialStepId = "",
  submitLabel,
  autoFocus = false,
  resetOnSubmit = false,
  onSubmit,
}: {
  groups: Group[];
  initialText?: string;
  initialStepId?: string;
  submitLabel: string;
  autoFocus?: boolean;
  resetOnSubmit?: boolean;
  onSubmit: (text: string, stepId: string) => void;
}) {
  const [text, setText] = useState(initialText);
  const [stepId, setStepId] = useState(initialStepId);

  const linkable = groups.filter((g) => g.steps.length > 0);
  const hasSteps = linkable.length > 0;

  const submit = () => {
    if (!text.trim()) return;
    onSubmit(text, stepId);
    if (resetOnSubmit) {
      setText("");
      setStepId("");
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Textarea
        aria-label="Note"
        rows={3}
        autoFocus={autoFocus}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Share a thought about this goal…"
        className="bg-card"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
          }
        }}
      />
      <div className="mt-2.5 flex flex-wrap items-center justify-end gap-2.5">
        {hasSteps && (
          <select
            aria-label="Link to a sub-goal"
            value={stepId}
            onChange={(e) => setStepId(e.target.value)}
            className="mr-auto h-9 max-w-[60%] rounded-lg border border-input bg-card px-2.5 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <option value="">No sub-goal</option>
            {linkable.map((group) => (
              <optgroup key={group.id} label={group.title}>
                {group.steps.map((step) => (
                  <option key={step.id} value={step.id}>
                    {step.text}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        )}
        <Button type="submit" disabled={!text.trim()}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

function NoteCard({
  note,
  groups,
  stepText,
  onEdit,
  onDelete,
}: {
  note: Note;
  groups: Group[];
  stepText?: string;
  onEdit: (text: string, stepId: string) => void;
  onDelete: () => void;
}) {
  const [editOpen, setEditOpen] = useState(false);

  return (
    <div className="group/note relative rounded-2xl border border-border bg-card px-5 py-4 shadow-sm">
      <p className="whitespace-pre-wrap pr-8 text-[14px] leading-relaxed">{note.text}</p>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
        <span>{formatWhen(note.createdAt)}</span>
        {stepText && (
          <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-muted px-2 py-0.5 font-medium text-foreground">
            <CornerDownRight className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
            <span className="truncate">{stepText}</span>
          </span>
        )}
      </div>

      <Menu.Root>
        <Menu.Trigger
          aria-label="Note options"
          className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full border border-border bg-card text-muted-foreground opacity-100 shadow-sm transition-opacity hover:text-foreground focus-visible:opacity-100 data-[popup-open]:opacity-100 lg:opacity-0 lg:group-hover/note:opacity-100"
        >
          <MoreVertical className="h-4 w-4" />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner side="bottom" align="end" sideOffset={6} className="z-50">
            <Menu.Popup className="min-w-40 rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-md outline-none">
              <Menu.Item
                onClick={() => setEditOpen(true)}
                className="flex cursor-default items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] outline-none data-[highlighted]:bg-muted"
              >
                <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                Edit
              </Menu.Item>
              <Menu.Item
                onClick={onDelete}
                className="flex cursor-default items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-destructive outline-none data-[highlighted]:bg-destructive/10"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete note
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit note</DialogTitle>
          </DialogHeader>
          <NoteForm
            groups={groups}
            initialText={note.text}
            initialStepId={note.stepId ?? ""}
            submitLabel="Save"
            autoFocus
            onSubmit={(text, stepId) => {
              onEdit(text, stepId);
              setEditOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * The goal's notes feed: a composer plus every note left on the goal. A note can
 * optionally be tied to one step ("sub-goal") of the goal, or left about the
 * goal as a whole.
 *
 * The composer starts hidden behind an "Add note" button and stays open once
 * revealed. The feed shows the first {@link PAGE_SIZE} notes and reveals more in
 * batches, all inside a height-capped, scrollable container.
 */
export function NotesSection({
  goalId,
  groups,
  notes,
}: {
  goalId: string;
  groups: Group[];
  notes: Note[];
}) {
  const { addNote, editNote, deleteNote } = useStore(
    useShallow((s) => ({
      addNote: s.addNote,
      editNote: s.editNote,
      deleteNote: s.deleteNote,
    }))
  );
  const [composerOpen, setComposerOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const labels = useMemo(() => stepLabels(groups), [groups]);

  const visible = notes.slice(0, visibleCount);
  const hasMore = notes.length > visible.length;

  return (
    <section className="mt-10">
      <SectionLabel
        action={
          !composerOpen && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-expanded={composerOpen}
              onClick={() => setComposerOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              Add note
            </Button>
          )
        }
      >
        Notes · {notes.length}
      </SectionLabel>

      {composerOpen && (
        <div className="mb-6">
          <NoteForm
            groups={groups}
            submitLabel="Add note"
            autoFocus
            resetOnSubmit
            // The composer stays open so several notes can be added in a row.
            onSubmit={(text, stepId) => addNote(goalId, text, stepId || undefined)}
          />
        </div>
      )}

      {notes.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 rounded-2xl border border-dashed border-border-strong px-5 py-10 text-center">
          <div className="text-[15px] font-bold">No notes yet</div>
          <p className="max-w-sm text-[13px] text-muted-foreground">
            Share a thought about this goal — what&rsquo;s working, what&rsquo;s stuck, what&rsquo;s next
          </p>
        </div>
      ) : (
        <>
          <div className="flex max-h-[36rem] flex-col gap-3 overflow-y-auto">
            {visible.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                groups={groups}
                stepText={note.stepId ? labels.get(note.stepId) : undefined}
                onEdit={(text, stepId) => editNote(goalId, note.id, text, stepId || undefined)}
                onDelete={() => deleteNote(goalId, note.id)}
              />
            ))}
          </div>
          {hasMore && (
            <div className="mt-4 flex justify-center">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
              >
                Load more
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
