import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { FakeListChatModel } from "@langchain/core/utils/testing";
import type { UIMessage } from "ai";
import { buildChatAgent } from "../langchain/agent";
import { streamTurn } from "../langchain/engine";

/**
 * The LangChain engine, driven by a fake model — no API key, no network.
 *
 * What this guards is the translation layer: a LangChain agent's stream has to
 * come out the other end as the AI SDK UI message parts the drawer renders and
 * `chat_messages.parts` stores. Get that wrong and history silently changes
 * shape, which no type would catch.
 *
 * The model must be one that streams token chunks (`FakeListChatModel`, not
 * `fakeModel()`): the adapter builds text parts from `AIMessageChunk`s, and a
 * model that only implements `_generate` yields a well-formed but *empty*
 * assistant message. That is the silent failure this file exists to catch.
 */

/** A user message in the shape the route hands the engine. */
function userMessage(text: string): UIMessage {
  return { id: "user-1", role: "user", parts: [{ type: "text", text }] };
}

type TurnResult = { message: UIMessage; aborted: boolean };

/** Drain a turn's UI message stream, returning what `onEnd` reported. */
async function runTurn(responses: string[]): Promise<TurnResult> {
  const model = new FakeListChatModel({ responses });
  const agent = buildChatAgent({ model, system: "You are a test." });

  let finished: UIMessage | undefined;
  let aborted: boolean | undefined;
  const message = userMessage("hello");

  const stream = streamTurn(agent, {
    threadId: "thread-test",
    conversation: [message],
    userMessage: message,
    signal: new AbortController().signal,
    onEnd: async ({ responseMessage, isAborted }) => {
      finished = responseMessage;
      aborted = isAborted;
    },
  });

  // onEnd fires only once the stream is fully consumed.
  for await (const chunk of stream as unknown as AsyncIterable<unknown>) {
    void chunk;
  }

  assert.ok(finished, "onEnd must report the assistant message");
  return { message: finished, aborted: aborted ?? false };
}

/** The message's text parts, joined — what the user actually reads. */
function textOf(message: UIMessage): string {
  return message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

describe("the LangChain engine", () => {
  it("streams the model's reply as AI SDK text parts", async () => {
    const { message, aborted } = await runTurn(["Here is your plan."]);

    assert.equal(message.role, "assistant");
    assert.equal(textOf(message), "Here is your plan.");
    assert.equal(
      aborted,
      false,
      "a completed stream must not report as aborted",
    );
  });

  it("gives the assistant message an id, so turns can't collide in the database", async () => {
    const { message } = await runTurn(["Noted."]);
    assert.ok(message.id, "the assistant message needs a stable id");
    assert.notEqual(
      message.id,
      "user-1",
      "the reply must not reuse the user message's id",
    );
  });
});
