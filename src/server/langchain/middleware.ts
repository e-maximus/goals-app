import "server-only";
import {
  humanInTheLoopMiddleware,
  modelCallLimitMiddleware,
  modelRetryMiddleware,
  summarizationMiddleware,
  toolErrorMiddleware,
  toolRetryMiddleware,
  type AnyAgentMiddleware,
  type InterruptOnConfig,
} from "langchain";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
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
 * How long the conversation gets before it is folded, and how much survives.
 *
 * These replace the hand-rolled window in [chat-agent.ts](../chat-agent.ts),
 * which counted turns rather than messages; a turn here is a user message plus
 * whatever tool traffic answering it took, so the numbers are in the same
 * neighbourhood without being a translation of each other.
 */
export const SUMMARIZE_AFTER_MESSAGES = 24;
export const KEEP_MESSAGES = 10;

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

/**
 * The tools that ask before they run: the irreversible ones.
 *
 * The system prompt has always asked the model to confirm before deleting, which
 * left it to the model's judgement. The registry already marks which tools are
 * destructive, so the same rule becomes a property of the agent loop instead —
 * the call stops whether or not the model meant it to.
 *
 * No "edit" decision: rewriting *which* goal gets deleted is not a
 * confirmation, and there is no sane way to offer it in a chat drawer.
 */
function destructiveInterrupts(): Record<string, InterruptOnConfig> {
  return Object.fromEntries(
    registry
      .filter((def) => def.destructive)
      .map((def) => [
        def.name,
        {
          allowedDecisions: ["approve", "reject"],
          description: `${def.title} — this cannot be undone.`,
        } satisfies InterruptOnConfig,
      ])
  );
}

export function chatMiddleware(options: { model?: BaseChatModel } = {}): AnyAgentMiddleware[] {
  return [
    // Pausing mid-run only works if the run can be resumed, which needs
    // somewhere to keep the state — the same condition summarization has.
    ...(options.model ? [humanInTheLoopMiddleware({ interruptOn: destructiveInterrupts() })] : []),
    // Only useful with a checkpointer: it folds the thread's own state, which
    // is only kept between turns when there is somewhere to keep it. Passing
    // the chat's model rather than a cheaper one is deliberate for now — the
    // summary is what the next turn reasons from, and this is one call per
    // couple of dozen messages.
    ...(options.model
      ? [
          summarizationMiddleware({
            model: options.model,
            trigger: { messages: SUMMARIZE_AFTER_MESSAGES },
            keep: { messages: KEEP_MESSAGES },
          }),
        ]
      : []),
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
