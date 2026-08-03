import assert from "node:assert/strict";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import type { UIMessage } from "ai";
import type { Pool } from "../db";
import { buildChatAgent } from "../langchain/agent";
import { OwnerScopedCheckpointer } from "../langchain/checkpointer";
import { streamTurn } from "../langchain/engine";
import { buildLangChainTools } from "../langchain/tools";
import { createOwner, reset, setupPool } from "./helpers";
import { scriptedModel, type ScriptedChatModel } from "./scripted-model";

/**
 * The agent's memory across turns, now that the thread's state lives in a
 * checkpoint rather than being rebuilt from `chat_messages` on every request.
 *
 * The assertions are about what the *model* sees on the second turn. That is
 * the part a type can't check and a single-turn test can't reach: if the state
 * isn't being written, or is being read under the wrong key, each turn simply
 * starts fresh and the chat quietly forgets — which looks like a bad model, not
 * a bug.
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
});

const THREAD = "thread-memory";

/** Run one turn on a thread, with state kept by an owner-bound checkpointer. */
async function turn(
  ownerId: string,
  threadId: string,
  text: string,
  model: ScriptedChatModel,
  seeded: boolean
): Promise<void> {
  const checkpointer = new OwnerScopedCheckpointer(pool, ownerId);
  const agent = buildChatAgent({
    model,
    system: "You are a test.",
    tools: buildLangChainTools({ pool, ownerId }),
    checkpointer,
  });

  const message: UIMessage = {
    id: `u-${text}`,
    role: "user",
    parts: [{ type: "text", text }],
  };
  const stream = streamTurn(
    agent,
    {
      threadId,
      conversation: [message],
      userMessage: message,
      signal: new AbortController().signal,
      onEnd: async () => {},
    },
    { seeded }
  );
  for await (const chunk of stream as unknown as AsyncIterable<unknown>) {
    void chunk;
  }
}

/** Every message text the model was handed on its last invocation. */
function lastPromptText(model: ScriptedChatModel): string {
  const call = model.calls;
  assert.ok(call > 0, "the model should have been called");
  return JSON.stringify(model.seen.at(-1) ?? []);
}

describe("chat memory across turns", () => {
  it("carries the earlier turn into the next one", async () => {
    const first = scriptedModel([{ text: "Noted." }]);
    await turn(owner, THREAD, "my dog is called Rex", first, false);

    const second = scriptedModel([{ text: "Rex." }]);
    await turn(owner, THREAD, "what is my dog called?", second, true);

    const prompt = lastPromptText(second);
    assert.match(
      prompt,
      /Rex/,
      "the second turn's model should see the first turn — state was not carried"
    );
  });

  it("keeps one owner's thread out of another's, even under the same id", async () => {
    const other = await createOwner(pool, "owner-2");

    const mine = scriptedModel([{ text: "Noted." }]);
    await turn(owner, THREAD, "my dog is called Rex", mine, false);

    // Same thread id, different owner: this must start from nothing.
    const theirs = scriptedModel([{ text: "I don't know." }]);
    await turn(other, THREAD, "what is my dog called?", theirs, false);

    assert.doesNotMatch(
      lastPromptText(theirs),
      /Rex/,
      "one account's conversation must never reach another's agent"
    );
  });

  it("starts a different thread clean", async () => {
    const first = scriptedModel([{ text: "Noted." }]);
    await turn(owner, THREAD, "my dog is called Rex", first, false);

    const elsewhere = scriptedModel([{ text: "I don't know." }]);
    await turn(owner, "thread-other", "what is my dog called?", elsewhere, false);

    assert.doesNotMatch(lastPromptText(elsewhere), /Rex/);
  });
});
