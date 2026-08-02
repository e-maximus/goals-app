import "server-only";
import {
  modelCallLimitMiddleware,
  modelRetryMiddleware,
  toolErrorMiddleware,
  toolRetryMiddleware,
  type AnyAgentMiddleware,
} from "langchain";
import { NotFoundError, ValidationError } from "../repo";
import { tools as registry } from "../tools";

/**
 * The chat agent's middleware stack — the reliability rules that used to be
 * scattered across the AI SDK call, expressed as first-class steps in the agent
 * loop.
 *
 * Order matters: middleware wraps the loop from the outside in, so the call
 * limit sits outermost and is the last word on when a turn ends.
 */

/** Cap on model calls in one turn — guards a runaway tool loop. */
export const MAX_MODEL_CALLS = 12;

/**
 * Tools that only read. Retrying one is free; retrying a write is not — a
 * `create_goal` that times out *after* the insert committed would, on retry,
 * create the goal twice. The registry already knows which is which, so the
 * distinction is derived rather than restated.
 */
const readOnlyToolNames = registry.filter((def) => !def.mutates).map((def) => def.name);

/**
 * Whether an error is worth trying again. A missing goal or a rejected argument
 * is a fact about the request, not a blip: retrying re-runs the same query to
 * get the same answer, and only delays telling the user.
 */
function isTransient(error: Error): boolean {
  return !(error instanceof NotFoundError || error instanceof ValidationError);
}

/**
 * What the model is told when a tool fails. It needs enough to answer honestly
 * — the system prompt tells it to say plainly when something is missing — but
 * an unexpected failure is ours, not the user's, so its message stays server
 * side rather than being read out to them.
 */
function describeToolError(error: unknown): string {
  if (error instanceof NotFoundError || error instanceof ValidationError) return error.message;
  console.error("chat tool failed", error);
  return "The tool failed unexpectedly. Tell the user it didn't work and don't retry it.";
}

export function chatMiddleware(): AnyAgentMiddleware[] {
  return [
    // Ends the turn rather than throwing, which is what `stopWhen:
    // stepCountIs(...)` did on the AI SDK engine: the user gets the partial
    // answer instead of an error.
    modelCallLimitMiddleware({ runLimit: MAX_MODEL_CALLS, exitBehavior: "end" }),
    modelRetryMiddleware({ maxRetries: 2 }),
    toolRetryMiddleware({
      tools: readOnlyToolNames,
      maxRetries: 2,
      retryOn: isTransient,
    }),
    toolErrorMiddleware({ onError: describeToolError }),
  ];
}
