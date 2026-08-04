import { z } from "zod";
import type { Goal, Task } from "@/lib/types";

/**
 * Zod schemas for the goals store's write payload. Shared by the save Server
 * Action; they mirror the domain types in src/lib/types.ts. Optional fields
 * stay optional so a tab opened before a field existed can still save.
 *
 * Mirroring by hand is the risk here: add a field to `Goal` and forget it here,
 * and every save would silently drop it. The assertions at the bottom of this
 * file make that a build error instead.
 */

const stepSchema = z.object({
  id: z.string(),
  text: z.string(),
  description: z.string().optional(),
  done: z.boolean(),
  dueDate: z.number().optional(),
});

const groupSchema = z.object({
  id: z.string(),
  title: z.string(),
  steps: z.array(stepSchema),
  dueDate: z.number().optional(),
});

const noteSchema = z.object({
  id: z.string(),
  text: z.string(),
  createdAt: z.number(),
  stepId: z.string().optional(),
});

const goalSchema = z.object({
  id: z.string(),
  title: z.string(),
  why: z.string().optional(),
  createdAt: z.number(),
  groups: z.array(groupSchema),
  notes: z.array(noteSchema).optional(),
  status: z.enum(["active", "paused"]).optional(),
  updatedAt: z.number().optional(),
  pausedAt: z.number().optional(),
  steps: z.array(stepSchema).optional(),
  dueDate: z.number().optional(),
});

const taskSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  goalId: z.string().optional(),
  daily: z.boolean().optional(),
  dueDate: z.number().optional(),
  done: z.boolean(),
  completedOn: z.number().optional(),
  plannedFor: z.number().optional(),
  createdAt: z.number(),
});

export const saveInputSchema = z.object({
  goals: z.array(goalSchema),
  tasks: z.array(taskSchema).optional(),
  baseUpdatedAt: z.number().nullable().optional(),
  // The day the user last settled a plan for. Optional for the same reason
  // `tasks` is: a tab opened before the day plan existed still saves its goals,
  // and leaving it out keeps whatever the server already has rather than
  // silently unsettling today.
  dayPlannedOn: z.number().optional(),
});

export type SaveInput = z.infer<typeof saveInputSchema>;

// ---- the schemas and the domain types must agree ----
//
// Checked in both directions, so neither side can drift: a validated payload
// has to be a usable domain value (so the action needs no casts), and every
// domain field has to be something the schema accepts (so adding a field to
// `Goal` without adding it here fails the build rather than silently dropping
// it on every save).
type MutuallyAssignable<A extends B, B extends C, C = A> = true;

export type SchemaMatchesGoal = MutuallyAssignable<z.infer<typeof goalSchema>, Goal>;
export type SchemaMatchesTask = MutuallyAssignable<z.infer<typeof taskSchema>, Task>;
