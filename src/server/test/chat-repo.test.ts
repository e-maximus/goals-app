import assert from "node:assert/strict";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import type { Pool } from "../db";
import {
  appendMessages,
  getOrCreateActiveThread,
  listMessages,
  setThreadTitle,
  updateSummary,
} from "../chat-repo";
import { NotFoundError } from "../repo";
import { createOwner, reset, setupPool } from "./helpers";

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

const textMsg = (text: string) => [{ type: "text", text }];

describe("chat-repo", () => {
  it("creates an active thread once and reuses it", async () => {
    const a = await getOrCreateActiveThread(pool, owner);
    const b = await getOrCreateActiveThread(pool, owner);
    assert.equal(a.id, b.id);
    assert.equal(a.title, null);
    assert.equal(a.summary, null);
    assert.equal(a.summaryThroughCreatedAt, null);
  });

  it("appends messages and reads them back in order", async () => {
    const thread = await getOrCreateActiveThread(pool, owner);
    await appendMessages(pool, owner, thread.id, [
      { id: "u1", role: "user", parts: textMsg("hi") },
      { id: "a1", role: "assistant", parts: textMsg("hello") },
    ]);
    const messages = await listMessages(pool, owner, thread.id);
    assert.deepEqual(
      messages.map((m) => [m.id, m.role]),
      [
        ["u1", "user"],
        ["a1", "assistant"],
      ]
    );
    // Monotonic timestamps preserve order even within a batch.
    assert.ok(messages[1].createdAt > messages[0].createdAt);
    assert.deepEqual(messages[0].parts, textMsg("hi"));
  });

  it("generates ids for messages that arrive without one", async () => {
    const thread = await getOrCreateActiveThread(pool, owner);
    await appendMessages(pool, owner, thread.id, [{ role: "assistant", parts: textMsg("x") }]);
    const [msg] = await listMessages(pool, owner, thread.id);
    assert.ok(msg.id.length > 0);
  });

  it("stores a title and rolling summary", async () => {
    const thread = await getOrCreateActiveThread(pool, owner);
    await setThreadTitle(pool, owner, thread.id, "Planning the week");
    await updateSummary(pool, owner, thread.id, "user wants weekly reviews", 1234);
    const reread = await getOrCreateActiveThread(pool, owner);
    assert.equal(reread.title, "Planning the week");
    assert.equal(reread.summary, "user wants weekly reviews");
    assert.equal(reread.summaryThroughCreatedAt, 1234);
  });

  it("keeps threads and messages isolated per owner", async () => {
    const other = await createOwner(pool, "owner-2");
    const mine = await getOrCreateActiveThread(pool, owner);
    await appendMessages(pool, owner, mine.id, [{ id: "m1", role: "user", parts: textMsg("mine") }]);

    // The other owner cannot read my thread's messages...
    assert.deepEqual(await listMessages(pool, other, mine.id), []);
    // ...nor append to it (the thread isn't theirs).
    await assert.rejects(
      appendMessages(pool, other, mine.id, [{ id: "x", role: "user", parts: textMsg("nope") }]),
      NotFoundError
    );
    // ...and a summary update on someone else's thread is a no-op.
    await updateSummary(pool, other, mine.id, "leak", 1);
    const still = await getOrCreateActiveThread(pool, owner);
    assert.equal(still.summary, null);

    // My data is untouched.
    const mineMsgs = await listMessages(pool, owner, mine.id);
    assert.equal(mineMsgs.length, 1);
  });
});
