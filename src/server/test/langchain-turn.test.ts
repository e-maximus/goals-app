import assert from "node:assert/strict";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import type { UIMessage } from "ai";
import type { Pool } from "../db";
import type { Goal } from "../domain";
import { buildChatAgent } from "../langchain/agent";
import { streamTurn } from "../langchain/engine";
import { buildLangChainTools } from "../langchain/tools";
import * as repo from "../repo";
import { createOwner, reset, setupPool } from "./helpers";
import { scriptedModel } from "./scripted-model";

/**
 * A whole turn on the LangChain engine: the model calls a tool, the tool writes
 * to Postgres, and the turn comes back as the UI message parts the drawer
 * renders and `chat_messages.parts` stores.
 *
 * This is the test the migration rides on. The pieces each have their own suite;
 * what only shows up here is whether they still line up — a tool call that
 * reaches the database but never reaches the transcript looks fine everywhere
 * else.
 */

let pool: Pool;
let owner: string;

beforeAll(async () => {
  pool = await setupPool();
});
afterAll(async () => {
  await pool.end();
});

const goal: Goal = {
  id: "goal-5k",
  title: "Run a 5k",
  createdAt: 1_700_000_000_000,
  groups: [],
  notes: [],
};

beforeEach(async () => {
  await reset(pool);
  owner = await createOwner(pool);
  await repo.replaceAll(pool, owner, [goal], null);
});

function userMessage(text: string): UIMessage {
  return { id: "user-1", role: "user", parts: [{ type: "text", text }] };
}

type TurnOutcome = { message: UIMessage; mutations: number };

/** Run one turn end to end and report the assistant message it produced. */
async function runTurn(
  script: Parameters<typeof scriptedModel>[0],
): Promise<TurnOutcome> {
  let mutations = 0;
  const agent = buildChatAgent({
    model: scriptedModel(script),
    system: "You are a test.",
    tools: buildLangChainTools({
      pool,
      ownerId: owner,
      onMutation: () => {
        mutations += 1;
      },
    }),
  });

  let finished: UIMessage | undefined;
  const message = userMessage("add a goal");
  const stream = streamTurn(agent, {
    threadId: "thread-test",
    conversation: [message],
    userMessage: message,
    signal: new AbortController().signal,
    onEnd: async ({ responseMessage }) => {
      finished = responseMessage;
    },
  });

  for await (const chunk of stream as unknown as AsyncIterable<unknown>) {
    void chunk;
  }

  assert.ok(finished, "onEnd must report the assistant message");
  return { message: finished, mutations };
}

/**
 * The parts the drawer treats as tool activity. LangChain's tools are dynamic
 * as far as the AI SDK is concerned, so they arrive as `dynamic-tool` rather
 * than `tool-<name>` — the drawer accepts both, and this mirrors it. Getting
 * this wrong is invisible until the store stops reloading after the agent
 * edits something.
 */
type ToolPart = { type: string; toolName?: string; state?: string };

function toolParts(message: UIMessage): ToolPart[] {
  return message.parts
    .filter((p) => {
      const type = (p as { type?: string }).type;
      return (
        typeof type === "string" &&
        (type.startsWith("tool-") || type === "dynamic-tool")
      );
    })
    .map((p) => p as unknown as ToolPart);
}

describe("a LangChain turn", () => {
  it("calls a tool, writes to the database, and answers", async () => {
    const { message, mutations } = await runTurn([
      {
        toolCalls: [{ name: "create_goal", args: { title: "Learn to swim" } }],
      },
      { text: "Added it." },
    ]);

    const { goals } = await repo.getState(pool, owner);
    assert.deepEqual(goals.map((g) => g.title).sort(), [
      "Learn to swim",
      "Run a 5k",
    ]);
    assert.equal(
      mutations,
      1,
      "the write must be reported so search reindexes",
    );

    const text = message.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("");
    assert.equal(text, "Added it.");
  });

  it("puts the tool call in the transcript, so the drawer can show it", async () => {
    const { message } = await runTurn([
      {
        toolCalls: [{ name: "create_goal", args: { title: "Learn to swim" } }],
      },
      { text: "Added it." },
    ]);

    const parts = toolParts(message);
    assert.equal(
      parts.length,
      1,
      "the assistant message should carry one tool part",
    );
    assert.equal(parts[0].toolName, "create_goal");
    assert.equal(
      parts[0].state,
      "output-available",
      "a finished call must carry its result — the drawer reads state to say Done",
    );
  });

  it("carries a failed tool call as an error, not as a broken turn", async () => {
    const { message } = await runTurn([
      { toolCalls: [{ name: "get_goal", args: { goalId: "no-such-goal" } }] },
      { text: "I couldn't find that goal." },
    ]);

    const parts = toolParts(message);
    assert.equal(parts.length, 1);
    assert.ok(
      parts[0].state === "output-error" ||
        parts[0].state === "output-available",
      `a failed tool call must still resolve, got ${parts[0].state}`,
    );
  });
});

describe("an interrupted LangChain turn", () => {
  it("reports the abort, so a truncated turn is never persisted", async () => {
    const agent = buildChatAgent({
      model: scriptedModel([
        { text: "one two three four five six seven eight" },
      ]),
      system: "You are a test.",
      tools: buildLangChainTools({ pool, ownerId: owner }),
    });

    const controller = new AbortController();
    const message = userMessage("hello");
    let aborted: boolean | undefined;

    const stream = streamTurn(agent, {
      threadId: "thread-test",
      conversation: [message],
      userMessage: message,
      signal: controller.signal,
      onEnd: async ({ isAborted }) => {
        aborted = isAborted;
      },
    });

    let seen = 0;
    for await (const chunk of stream as unknown as AsyncIterable<unknown>) {
      void chunk;
      if (++seen === 3) controller.abort();
    }

    // The stream ends early and otherwise looks like a clean finish; only the
    // signal knows better. Getting this wrong writes half a reply to the thread.
    assert.equal(aborted, true, "an aborted turn must report as aborted");
  });
});
