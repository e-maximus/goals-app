import assert from "node:assert/strict";
import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from "vitest";
import type { Pool } from "../db";
import { listenerCount, recordChange, subscribe } from "../events";
import * as repo from "../repo";
import { createOwner, reset, setupPool } from "./helpers";

/**
 * The goals stream's server half. What matters here is not that a message is
 * sent but *when*: a listener woken before the write commits would read the old
 * state and publish it as the new one.
 */

let pool: Pool;
let owner: string;
const unsubscribes: Array<() => void> = [];

/** Subscribe and remember the teardown, so a failing test can't leak a listener. */
function listen(ownerId: string, fn: (updatedAt: number) => void): void {
  unsubscribes.push(subscribe(ownerId, fn));
}

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
afterEach(() => {
  for (const off of unsubscribes.splice(0)) off();
});

describe("goals events", () => {
  it("announces a write with the stamp the store now reads at", async () => {
    const seen: number[] = [];
    listen(owner, (updatedAt) => seen.push(updatedAt));

    await repo.createGoal(pool, owner, "Launch my podcast");

    assert.equal(seen.length, 1);
    const state = await repo.getState(pool, owner);
    assert.equal(seen[0], state.updatedAt);
  });

  it("publishes only after the transaction has committed", async () => {
    // Read the store from inside the listener: if the event were published mid
    // transaction, this read (on another connection) would not see the goal.
    let readback: Promise<string[]> | undefined;
    listen(owner, () => {
      readback = repo.getState(pool, owner).then((s) => s.goals.map((g) => g.title));
    });

    await repo.createGoal(pool, owner, "Launch my podcast");

    assert.ok(readback, "the write published no event");
    assert.deepEqual(await readback, ["Launch my podcast"]);
  });

  it("publishes nothing when the transaction rolls back", async () => {
    const seen: number[] = [];
    listen(owner, (updatedAt) => seen.push(updatedAt));

    await assert.rejects(
      pool.transaction(async (client) => {
        recordChange(client, owner, Date.now());
        throw new Error("write failed");
      })
    );

    assert.deepEqual(seen, []);
  });

  it("keeps one owner's writes away from another owner's listener", async () => {
    const other = await createOwner(pool, "owner-2");
    const mine: number[] = [];
    const theirs: number[] = [];
    listen(owner, (updatedAt) => mine.push(updatedAt));
    listen(other, (updatedAt) => theirs.push(updatedAt));

    await repo.createGoal(pool, owner, "Launch my podcast");

    assert.equal(mine.length, 1);
    assert.deepEqual(theirs, []);
  });

  it("collapses a transaction's repeated touches into one event", async () => {
    const seen: number[] = [];
    listen(owner, (updatedAt) => seen.push(updatedAt));

    // replaceAll touches the owner once for a whole-store write, however many
    // goals it carries — the web app's save path must not fan out into events.
    await repo.replaceAll(pool, owner, [], null, []);

    assert.equal(seen.length, 1);
  });

  it("stops delivering once unsubscribed", async () => {
    const seen: number[] = [];
    const off = subscribe(owner, (updatedAt) => seen.push(updatedAt));
    off();

    await repo.createGoal(pool, owner, "Launch my podcast");

    assert.deepEqual(seen, []);
    assert.equal(listenerCount(owner), 0);
  });
});
