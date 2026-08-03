import "server-only";
import type { RunnableConfig } from "@langchain/core/runnables";

/**
 * What a chat turn looks like in a trace.
 *
 * LangChain traces to LangSmith on its own once `LANGSMITH_TRACING=true` and
 * `LANGSMITH_API_KEY` are set — nothing here turns it on. What it cannot know is
 * *whose* turn this is and which thread it belongs to, and a trace you can't
 * filter by user or follow across a conversation answers no question worth
 * asking in production.
 *
 * `runId` is deliberately absent: LangSmith assigns one. What we add is only
 * what this app knows.
 */
export type TraceContext = {
  /** The account the turn runs as — never the model's to see, only the trace's. */
  ownerId: string;
  /** The chat thread, so a whole conversation can be read end to end. */
  threadId: string;
  /** Which engine produced this turn, while both still exist. */
  engine: "langchain";
};

/**
 * Trace metadata for one turn, merged into the agent's run config.
 *
 * Kept to identifiers. A trace is a third-party copy of the conversation, so
 * the turn's *content* goes there only because LangSmith records inputs and
 * outputs by design — we don't add anything to it, and in particular no email
 * or display name, which the account id doesn't reveal.
 */
export function traceConfig({ ownerId, threadId, engine }: TraceContext): RunnableConfig {
  return {
    runName: "chat-turn",
    tags: [`engine:${engine}`],
    metadata: {
      // `ls_` keys are LangSmith's own conventions for filtering.
      owner_id: ownerId,
      thread_id: threadId,
      engine,
    },
  };
}

/** Whether traces are actually going anywhere — for the health endpoint to say so. */
export function tracingEnabled(): boolean {
  return process.env.LANGSMITH_TRACING === "true" && Boolean(process.env.LANGSMITH_API_KEY);
}
