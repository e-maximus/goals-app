import { z } from "zod";

/**
 * Zod schemas for the goals store's write payload (§7B). Shared by the save
 * Server Action; mirror the domain types in src/lib/types.ts. Optional fields
 * stay optional so a tab opened before a field existed can still save.
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
  createdAt: z.number(),
});

export const saveInputSchema = z.object({
  goals: z.array(goalSchema),
  tasks: z.array(taskSchema).optional(),
  baseUpdatedAt: z.number().nullable().optional(),
});

export type SaveInput = z.infer<typeof saveInputSchema>;
