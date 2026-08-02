import assert from "node:assert/strict";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { emptyCheckpoint, type Checkpoint, type CheckpointMetadata } from "@langchain/langgraph-checkpoint";
import type { Pool } from "../db";
import { OwnerScopedCheckpointer } from "../langchain/checkpointer";
import { createOwner, reset, setupPool } from "./helpers";

/**
 * The owner-scoped checkpoint saver.
 *
 * The interesting assertions here are the isolation ones. LangGraph's own
 * Postgres saver keys on `thread_id` alone, so two accounts that happened to
 * name a thread the same — or one that learned the other's id — would read each
 * other's conversation state. This saver binds the owner at construction; these
 * tests are what say so.
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

const THREAD = "thread-1";

function config(threadId = THREAD, checkpointId?: string) {
  return {
    configurable: {
      thread_id: threadId,
      checkpoint_ns: "",
      ...(checkpointId ? { checkpoint_id: checkpointId } : {}),
    },
  };
}

/** A checkpoint with a known id, so a test can assert on which one came back. */
function checkpointWithId(id: string): Checkpoint {
  return { ...emptyCheckpoint(), id };
}

const metadata: CheckpointMetadata = { source: "input", step: 1, parents: {} };

describe("the owner-scoped checkpointer", () => {
  it("stores a checkpoint and reads it back", async () => {
    const saver = new OwnerScopedCheckpointer(pool, owner);
    const written = await saver.put(config(), checkpointWithId("cp-1"), metadata);

    assert.equal(written.configurable?.checkpoint_id, "cp-1");

    const tuple = await saver.getTuple(config());
    assert.ok(tuple, "the thread should have a checkpoint");
    assert.equal(tuple.checkpoint.id, "cp-1");
    assert.equal(tuple.metadata?.step, 1);
  });

  it("returns the newest checkpoint when none is named", async () => {
    const saver = new OwnerScopedCheckpointer(pool, owner);
    await saver.put(config(), checkpointWithId("cp-1"), metadata);
    await saver.put(config(undefined, "cp-1"), checkpointWithId("cp-2"), {
      ...metadata,
      step: 2,
    });

    const tuple = await saver.getTuple(config());
    assert.equal(tuple?.checkpoint.id, "cp-2");
    assert.equal(
      tuple?.parentConfig?.configurable?.checkpoint_id,
      "cp-1",
      "the newer checkpoint should point back at the one it came from"
    );
  });

  it("reads back a named checkpoint rather than the newest", async () => {
    const saver = new OwnerScopedCheckpointer(pool, owner);
    await saver.put(config(), checkpointWithId("cp-1"), metadata);
    await saver.put(config(undefined, "cp-1"), checkpointWithId("cp-2"), metadata);

    const tuple = await saver.getTuple(config(THREAD, "cp-1"));
    assert.equal(tuple?.checkpoint.id, "cp-1");
  });

  it("lists a thread's checkpoints, newest first", async () => {
    const saver = new OwnerScopedCheckpointer(pool, owner);
    await saver.put(config(), checkpointWithId("cp-1"), metadata);
    await saver.put(config(undefined, "cp-1"), checkpointWithId("cp-2"), metadata);

    const seen: string[] = [];
    for await (const tuple of saver.list(config())) seen.push(tuple.checkpoint.id);
    assert.deepEqual(seen, ["cp-2", "cp-1"]);
  });

  it("keeps writes with their checkpoint", async () => {
    const saver = new OwnerScopedCheckpointer(pool, owner);
    await saver.put(config(), checkpointWithId("cp-1"), metadata);
    await saver.putWrites(config(THREAD, "cp-1"), [["messages", { hello: "world" }]], "task-1");

    const tuple = await saver.getTuple(config(THREAD, "cp-1"));
    assert.deepEqual(tuple?.pendingWrites, [["task-1", "messages", { hello: "world" }]]);
  });

  it("replaces a write rather than duplicating it on retry", async () => {
    const saver = new OwnerScopedCheckpointer(pool, owner);
    await saver.put(config(), checkpointWithId("cp-1"), metadata);
    await saver.putWrites(config(THREAD, "cp-1"), [["messages", "first"]], "task-1");
    await saver.putWrites(config(THREAD, "cp-1"), [["messages", "second"]], "task-1");

    const tuple = await saver.getTuple(config(THREAD, "cp-1"));
    assert.deepEqual(tuple?.pendingWrites, [["task-1", "messages", "second"]]);
  });

  it("cannot see another owner's checkpoint, even with the same thread id", async () => {
    const other = await createOwner(pool, "owner-2");
    await new OwnerScopedCheckpointer(pool, owner).put(config(), checkpointWithId("cp-1"), metadata);

    const theirs = new OwnerScopedCheckpointer(pool, other);
    assert.equal(await theirs.getTuple(config()), undefined);

    const listed = [];
    for await (const tuple of theirs.list(config())) listed.push(tuple);
    assert.deepEqual(listed, []);
  });

  it("cannot delete another owner's thread", async () => {
    const other = await createOwner(pool, "owner-2");
    const mine = new OwnerScopedCheckpointer(pool, owner);
    await mine.put(config(), checkpointWithId("cp-1"), metadata);

    await new OwnerScopedCheckpointer(pool, other).deleteThread(THREAD);

    const tuple = await mine.getTuple(config());
    assert.equal(tuple?.checkpoint.id, "cp-1", "the other owner's delete must not reach this row");
  });

  it("deletes its own thread, writes and all", async () => {
    const saver = new OwnerScopedCheckpointer(pool, owner);
    await saver.put(config(), checkpointWithId("cp-1"), metadata);
    await saver.putWrites(config(THREAD, "cp-1"), [["messages", "x"]], "task-1");

    await saver.deleteThread(THREAD);

    assert.equal(await saver.getTuple(config()), undefined);
    const writes = await pool.db.chatCheckpointWrite.count({ where: { owner_id: owner } });
    assert.equal(writes, 0);
  });
});
