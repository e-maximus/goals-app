"use client";

import { useState } from "react";
import { Menu } from "@base-ui/react/menu";
import { useStore } from "@/lib/store";
import { useShallow } from "zustand/shallow";
import type { Comment } from "@/lib/types";
import { SectionLabel } from "@/components/ui-bits";
import { PromptDialog } from "@/components/prompt-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MoreVertical, Pencil, Trash2 } from "lucide-react";

const DAY = 1000 * 60 * 60 * 24;

function formatWhen(createdAt: number): string {
  const days = Math.floor((Date.now() - createdAt) / DAY);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return new Date(createdAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function CommentCard({
  comment,
  onEdit,
  onDelete,
}: {
  comment: Comment;
  onEdit: (text: string) => void;
  onDelete: () => void;
}) {
  const [editOpen, setEditOpen] = useState(false);

  return (
    <div className="group/comment relative rounded-2xl border border-border bg-card px-5 py-4 shadow-sm">
      <p className="whitespace-pre-wrap pr-8 text-[14px] leading-relaxed">{comment.text}</p>
      <div className="mt-2.5 text-xs text-muted-foreground">{formatWhen(comment.createdAt)}</div>

      <Menu.Root>
        <Menu.Trigger
          aria-label="Comment options"
          className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full border border-border bg-card text-muted-foreground opacity-100 shadow-sm transition-opacity hover:text-foreground focus-visible:opacity-100 data-[popup-open]:opacity-100 lg:opacity-0 lg:group-hover/comment:opacity-100"
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
                Delete comment
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>

      <PromptDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        title="Edit comment"
        label="Comment"
        submitLabel="Save"
        multiline
        initialValue={comment.text}
        onSubmit={onEdit}
      />
    </div>
  );
}

/**
 * The goal's comment feed: a composer plus every comment left on the goal as a
 * whole. Comments are not attached to a group or a step — this is the place for
 * thinking out loud about the goal itself.
 */
export function CommentsSection({ goalId, comments }: { goalId: string; comments: Comment[] }) {
  const { addComment, editComment, deleteComment } = useStore(
    useShallow((s) => ({
      addComment: s.addComment,
      editComment: s.editComment,
      deleteComment: s.deleteComment,
    }))
  );
  const [draft, setDraft] = useState("");

  const post = () => {
    if (!draft.trim()) return;
    addComment(goalId, draft);
    setDraft("");
  };

  return (
    <section className="mt-10">
      <SectionLabel>Comments · {comments.length}</SectionLabel>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          post();
        }}
        className="mb-6"
      >
        <label htmlFor="comment-composer" className="sr-only">
          Comment
        </label>
        <Textarea
          id="comment-composer"
          rows={3}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Share a thought about this goal…"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              post();
            }
          }}
        />
        <div className="mt-2.5 flex justify-end">
          <Button type="submit" disabled={!draft.trim()}>
            Post comment
          </Button>
        </div>
      </form>

      {comments.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 rounded-2xl border border-dashed border-border-strong px-5 py-10 text-center">
          <div className="text-[15px] font-bold">No comments yet</div>
          <p className="max-w-sm text-[13px] text-muted-foreground">
            Share a thought about this goal — what&rsquo;s working, what&rsquo;s stuck, what&rsquo;s next
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {comments.map((comment) => (
            <CommentCard
              key={comment.id}
              comment={comment}
              onEdit={(text) => editComment(goalId, comment.id, text)}
              onDelete={() => deleteComment(goalId, comment.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
