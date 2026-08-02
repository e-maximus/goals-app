import assert from "node:assert/strict";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import type { UIMessage } from "ai";
import type { Pool } from "../db";
import { buildChatAgent } from "../langchain/agent";
import { streamTurn } from "../langchain/engine";
import { MAX_MODEL_CALLS } from "../langchain/middleware";
import { buildLangChainTools } from "../langchain/tools";
import * as repo from "../repo";
import { createOwner, reset, setupPool } from "./helpers";
import { scriptedModel, type ScriptedChatModel } from "./scripted-model";

/**
 * The agent's middleware stack: the rules that decide when a turn stops and
 * what happens when something fails. They replace behaviour the AI SDK engine
 * expressed inline (`stopWhen: stepCountIs(...)`), so they are worth asserting
 * rather than trusting to configuration.
 */

let pool: Pool;
let owner: string;

beforeAll(async () => {
  pool = await setupPool();
});
afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await reset(pool);
  owner = await createOwner(pool);
  await repo.replaceAll(
    pool,
    owner,
    [{ id: "goal-5k", title: "Run a 5k", createdAt: 1_700_000_000_000, groups: [], notes: [] }],
    null
  );
});

type Outcome = { message: UIMessage; model: ScriptedChatModel };

/** Run a turn against a scripted model and report what came back. */
async function runTurn(script: Parameters<typeof scriptedModel>[0]): Promise<Outcome> {
  const model = scriptedModel(script);
  const agent = buildChatAgent({
    model,
    system: "You are a test.",
    tools: buildLangChainTools({ pool, ownerId: owner }),
  });

  let finished: UIMessage | undefined;
  const message: UIMessage = { id: "user-1", role: "user", parts: [{ type: "text", text: "go" }] };
  const stream = streamTurn(agent, {
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
  return { message: finished, model };
}

describe("the chat agent's middleware", () => {
  it("stops a runaway tool loop instead of looping forever", async () => {
    // A model that only ever asks for another tool call — without a limit this
    // never terminates.
    const { model } = await runTurn([
      { toolCalls: [{ name: "list_goals", args: {} }] },
    ]);

    assert.ok(
      model.calls <= MAX_MODEL_CALLS,
      `the model was called ${model.calls} times, past the ${MAX_MODEL_CALLS} cap`
    );
    assert.ok(model.calls > 1, "the loop should have run more than once before being cut off");
  });

  it("ends the turn rather than failing it when the cap is hit", async () => {
    const { message } = await runTurn([{ toolCalls: [{ name: "list_goals", args: {} }] }]);

    // The user gets whatever the agent managed, not an error page: the turn is
    // still a well-formed assistant message the drawer can render and the
    // messages table can store.
    assert.equal(message.role, "assistant");
    assert.ok(message.parts.length > 0);
  });

  it("hands a missing goal back to the model as a readable message", async () => {
    const { message } = await runTurn([
      { toolCalls: [{ name: "get_goal", args: { goalId: "no-such-goal" } }] },
      { text: "I couldn't find that goal." },
    ]);

    const toolPart = message.parts.find(
      (p) => (p as { type?: string }).type === "dynamic-tool"
    ) as { output?: unknown; errorText?: unknown } | undefined;
    assert.ok(toolPart, "the failed call should still appear in the transcript");

    const reported = JSON.stringify(toolPart.output ?? toolPart.errorText ?? "");
    assert.match(reported, /not found/, `the model should be told what went wrong: ${reported}`);
  });

  it("does not retry a write — a retried create would duplicate the goal", async () => {
    // The retry middleware is scoped to read-only tools. Assert the scoping
    // directly: a successful write happens exactly once.
    let mutations = 0;
    const agent = buildChatAgent({
      model: scriptedModel([
        { toolCalls: [{ name: "create_goal", args: { title: "Learn to swim" } }] },
        { text: "Done." },
      ]),
      system: "You are a test.",
      tools: buildLangChainTools({
        pool,
        ownerId: owner,
        onMutation: () => {
          mutations += 1;
        },
      }),
    });

    const message: UIMessage = { id: "u", role: "user", parts: [{ type: "text", text: "go" }] };
    const stream = streamTurn(agent, {
      conversation: [message],
      userMessage: message,
      signal: new AbortController().signal,
      onEnd: async () => {},
    });
    for await (const chunk of stream as unknown as AsyncIterable<unknown>) {
      void chunk;
    }

    const { goals } = await repo.getState(pool, owner);
    assert.equal(
      goals.filter((g) => g.title === "Learn to swim").length,
      1,
      "the goal must exist exactly once"
    );
    assert.equal(mutations, 1);
  });
});
