import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { traceConfig, tracingEnabled } from "../langchain/tracing";

/**
 * Trace metadata. Small, but worth pinning: a trace with no owner or thread on
 * it can't be filtered by user or read as a conversation, which is most of why
 * you'd want one — and that failure is invisible until someone is trying to
 * debug a live complaint.
 */

describe("trace metadata", () => {
  it("carries the owner, the thread and the engine", () => {
    const config = traceConfig({ ownerId: "owner-1", threadId: "thread-1", engine: "langchain" });

    assert.equal(config.metadata?.owner_id, "owner-1");
    assert.equal(config.metadata?.thread_id, "thread-1");
    assert.equal(config.metadata?.engine, "langchain");
    assert.deepEqual(config.tags, ["engine:langchain"]);
    assert.equal(config.runName, "chat-turn");
  });

  it("carries identifiers only", () => {
    const config = traceConfig({ ownerId: "owner-1", threadId: "thread-1", engine: "langchain" });

    // A trace is a third-party copy of the conversation. It records inputs and
    // outputs by design; we should not be adding anything else about the person.
    assert.deepEqual(Object.keys(config.metadata ?? {}).sort(), [
      "engine",
      "owner_id",
      "thread_id",
    ]);
  });
});

describe("whether tracing is on", () => {
  const previous = { ...process.env };
  const restore = () => {
    process.env.LANGSMITH_TRACING = previous.LANGSMITH_TRACING;
    process.env.LANGSMITH_API_KEY = previous.LANGSMITH_API_KEY;
  };

  it("is off without a key, even when asked for", () => {
    process.env.LANGSMITH_TRACING = "true";
    delete process.env.LANGSMITH_API_KEY;
    assert.equal(tracingEnabled(), false);
    restore();
  });

  it("is off with a key but not asked for", () => {
    delete process.env.LANGSMITH_TRACING;
    process.env.LANGSMITH_API_KEY = "sk-test";
    assert.equal(tracingEnabled(), false);
    restore();
  });

  it("is on with both", () => {
    process.env.LANGSMITH_TRACING = "true";
    process.env.LANGSMITH_API_KEY = "sk-test";
    assert.equal(tracingEnabled(), true);
    restore();
  });
});
