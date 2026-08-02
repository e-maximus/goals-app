import assert from "node:assert/strict";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import type { UIMessage } from "ai";
import type { Pool } from "../db";
import { buildChatAgent } from "../langchain/agent";
import { OwnerScopedCheckpointer } from "../langchain/checkpointer";
import { streamTurn } from "../langchain/engine";
import { buildLangChainTools } from "../langchain/tools";
import * as repo from "../repo";
import { createOwner, reset, setupPool } from "./helpers";
import { scriptedModel } from "./scripted-model";

/**
 * Confirming a destructive tool before it runs.
 *
 * The system prompt used to ask the model to check with the user before
 * deleting, which made it advice. These tests are the difference between advice
 * and a guarantee: the delete must not reach the database until the user says
 * so, whatever the model intended.
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

const THREAD = "thread-approval";

/** Run a turn (or resume a paused one) and report the assistant message. */
async function run(
  approvals?: Array<{ approved: boolean; reason?: string }>
): Promise<UIMessage | undefined> {
  const checkpointer = new OwnerScopedCheckpointer(pool, owner);
  const agent = buildChatAgent({
    model: scriptedModel([
      { toolCalls: [{ name: "delete_goal", args: { goalId: "goal-5k" } }] },
      { text: "Done." },
    ]),
    system: "You are a test.",
    tools: buildLangChainTools({ pool, ownerId: owner }),
    checkpointer,
  });

  const message: UIMessage = {
    id: "u-1",
    role: "user",
    parts: [{ type: "text", text: "delete the 5k goal" }],
  };
  let finished: UIMessage | undefined;
  const stream = streamTurn(
    agent,
    {
      threadId: THREAD,
      conversation: [message],
      userMessage: message,
      approvals,
      signal: new AbortController().signal,
      onEnd: async ({ responseMessage }) => {
        finished = responseMessage;
      },
    },
    { seeded: approvals !== undefined }
  );
  for await (const chunk of stream as unknown as AsyncIterable<unknown>) {
    void chunk;
  }
  return finished;
}

/** The titles still in the store. */
async function titles(): Promise<string[]> {
  const { goals } = await repo.getState(pool, owner);
  return goals.map((g) => g.title);
}

describe("confirming a destructive tool", () => {
  it("does not delete anything until the user answers", async () => {
    const message = await run();

    assert.deepEqual(await titles(), ["Run a 5k"], "the goal must survive an unanswered request");

    const waiting = (message?.parts ?? []).find(
      (p) => (p as { state?: string }).state === "approval-requested"
    ) as { toolName?: string } | undefined;
    assert.ok(waiting, "the turn should end asking the user");
    assert.equal(waiting.toolName, "delete_goal");
  });

  it("deletes once the user allows it", async () => {
    await run();
    await run([{ approved: true }]);

    assert.deepEqual(await titles(), [], "approving should let the delete through");
  });

  it("leaves the goal alone when the user refuses", async () => {
    await run();
    await run([{ approved: false, reason: "changed my mind" }]);

    assert.deepEqual(await titles(), ["Run a 5k"], "refusing must protect the goal");
  });

  it("tells the model why it was refused, so the reply can say so", async () => {
    await run();
    const message = await run([{ approved: false, reason: "changed my mind" }]);

    const reported = JSON.stringify(message?.parts ?? []);
    assert.match(reported, /changed my mind/);
  });

  it("lets a non-destructive tool through without asking", async () => {
    const checkpointer = new OwnerScopedCheckpointer(pool, owner);
    const agent = buildChatAgent({
      model: scriptedModel([
        { toolCalls: [{ name: "create_goal", args: { title: "Learn to swim" } }] },
        { text: "Added." },
      ]),
      system: "You are a test.",
      tools: buildLangChainTools({ pool, ownerId: owner }),
      checkpointer,
    });
    const message: UIMessage = { id: "u", role: "user", parts: [{ type: "text", text: "add" }] };
    const stream = streamTurn(agent, {
      threadId: "thread-plain",
      conversation: [message],
      userMessage: message,
      signal: new AbortController().signal,
      onEnd: async () => {},
    });
    for await (const chunk of stream as unknown as AsyncIterable<unknown>) {
      void chunk;
    }

    assert.ok(
      (await titles()).includes("Learn to swim"),
      "only destructive tools should be gated"
    );
  });
});
