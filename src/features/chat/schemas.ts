import { z } from "zod";

/**
 * The shape a chat POST is allowed to have.
 *
 * Only the trailing user message is actually used — the model's context is
 * rebuilt from the database, never from what the client sent — so this
 * validates the envelope rather than the whole AI SDK message type: an id and a
 * role we recognise, and parts we pass through untouched.
 */
export const chatRequestSchema = z.object({
  messages: z
    .array(
      z.object({
        id: z.string().min(1),
        role: z.enum(["user", "assistant", "system"]),
        parts: z.array(z.unknown()).default([]),
      })
    )
    .min(1),
});

/**
 * A tool call the agent paused on, once the user has answered it.
 *
 * The client sends this back inside the assistant message it is already
 * showing, so — unlike the rest of the transcript — it is a claim about *our*
 * state that we act on. Hence a real schema rather than pass-through: the
 * `approved` flag decides whether an irreversible tool runs.
 */
export const approvalPartSchema = z.object({
  type: z.string(),
  state: z.literal("approval-responded"),
  approval: z.object({
    id: z.string().min(1),
    approved: z.boolean(),
    reason: z.string().optional(),
  }),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;
