import "server-only";
import type { UIMessage } from "ai";
import type { ToolContext } from "./tools";

/**
 * The contract between the chat route and the model stack behind it.
 *
 * The chat runs on LangChain ([langchain/engine.ts](./langchain/engine.ts)).
 * Everything *around* the model — resolving the owner, validating the request,
 * building context from the database, persisting the finished turn — is the
 * route's job; an engine only turns a prepared turn into a streaming response.
 * The split survives the migration it was introduced for because it is what
 * keeps the route free of the model stack's vocabulary.
 *
 * The wire protocol to the browser is the AI SDK's UI message stream. That is
 * why `ai` is still a dependency: as the protocol the drawer and the stored
 * `parts` shape are written against, not as the engine.
 */

/**
 * One answer to one paused tool call. `reason` is the user's words when they
 * said no, which the model reads so its reply can acknowledge why.
 */
export type ToolApproval = { approved: boolean; reason?: string };

/** Everything an engine needs to run one turn. */
export type TurnInput = {
  /** The system prompt, already carrying the thread's rolling summary. */
  system: string;
  /** The chat thread this turn belongs to — also the graph's state key. */
  threadId: string;
  /** Live context from the database plus the new user message, oldest first. */
  conversation: UIMessage[];
  /** The new user message — the engine echoes its id back for persistence. */
  userMessage: UIMessage;
  /**
   * Present when this request answers a paused turn rather than starting one:
   * the user has approved or rejected the tool the agent stopped on. The
   * decisions are in the order the agent asked for them.
   */
  approvals?: ToolApproval[];
  /** Owner-bound context every tool call runs under. */
  toolContext: ToolContext;
  /** Aborted when the client goes away mid-stream. */
  signal: AbortSignal;
  /**
   * Called once the stream has ended. `isAborted` means the client hung up: the
   * turn is incomplete and must not be persisted.
   */
  onEnd: (event: { responseMessage: UIMessage; isAborted: boolean }) => Promise<void>;
};

export type ChatEngine = (input: TurnInput) => Promise<Response>;
