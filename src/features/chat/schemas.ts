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

export type ChatRequest = z.infer<typeof chatRequestSchema>;
