import assert from "node:assert/strict";
import { describe, it } from "vitest";
import type { UIMessage } from "ai";
import { sanitize, selectContext } from "../chat-agent";
import type { StoredChatMessage } from "../chat-repo";

/** Build a stored message; createdAt defaults to the index for easy ordering. */
function msg(role: string, createdAt: number, text = role): StoredChatMessage {
  return { id: `${role}-${createdAt}`, role, parts: [{ type: "text", text }], createdAt };
}

/** A user→assistant pair at consecutive timestamps starting at `t`. */
function turn(t: number): StoredChatMessage[] {
  return [msg("user", t), msg("assistant", t + 1)];
}

describe("selectContext", () => {
  it("returns everything when under the turn budget", () => {
    const messages = [...turn(1), ...turn(3)];
    const picked = selectContext(messages, null, 8);
    assert.equal(picked.length, 4);
  });

  it("drops messages at or before the summary pointer", () => {
    const messages = [...turn(1), ...turn(3)];
    // Pointer at 2 (end of first turn) — only the second turn survives.
    const picked = selectContext(messages, 2, 8);
    assert.deepEqual(
      picked.map((m) => m.createdAt),
      [3, 4]
    );
  });

  it("trims to the last N turns, cutting on a user boundary", () => {
    const messages = [...turn(1), ...turn(3), ...turn(5), ...turn(7)];
    const picked = selectContext(messages, null, 2);
    // Last two turns only, and the window starts at a user message.
    assert.equal(picked.length, 4);
    assert.equal(picked[0].role, "user");
    assert.equal(picked[0].createdAt, 5);
  });
});

describe("sanitize", () => {
  const toolPart = (state: string) => ({ type: "tool-create_goal", state, toolCallId: "t1" });

  it("keeps completed tool parts and text", () => {
    const messages: UIMessage[] = [
      {
        id: "a1",
        role: "assistant",
        parts: [toolPart("output-available"), { type: "text", text: "done" }],
      } as unknown as UIMessage,
    ];
    const out = sanitize(messages);
    assert.equal(out.length, 1);
    assert.equal(out[0].parts.length, 2);
  });

  it("drops a tool part still awaiting its result", () => {
    const messages: UIMessage[] = [
      {
        id: "a1",
        role: "assistant",
        parts: [toolPart("input-available"), { type: "text", text: "hi" }],
      } as unknown as UIMessage,
    ];
    const out = sanitize(messages);
    assert.equal(out[0].parts.length, 1);
    assert.equal((out[0].parts[0] as { type: string }).type, "text");
  });

  it("removes a message left with no parts", () => {
    const messages: UIMessage[] = [
      { id: "a1", role: "assistant", parts: [toolPart("input-available")] } as unknown as UIMessage,
    ];
    assert.deepEqual(sanitize(messages), []);
  });
});
