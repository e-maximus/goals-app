import assert from "node:assert/strict";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import type { Pool } from "../db";
import type { Goal } from "../domain";
import { buildLangChainTools } from "../langchain/tools";
import * as repo from "../repo";
import { tools as registry } from "../tools";
import { createOwner, reset, setupPool } from "./helpers";

/**
 * The LangChain adapter over the shared tool registry.
 *
 * Runs against a real Postgres like the rest of the repo-facing suites: the
 * point is that a tool call reaches the database as the same owner-scoped write
 * the MCP surface makes, not that a mock was invoked.
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
  groups: [{ id: "g-1", title: "Base", steps: [{ id: "s-1", text: "Buy shoes", done: false }] }],
  notes: [],
};

beforeEach(async () => {
  await reset(pool);
  owner = await createOwner(pool);
  await repo.replaceAll(pool, owner, [goal], null);
});

/** Find one adapted tool by name; fails loudly rather than returning undefined. */
function toolNamed(tools: ReturnType<typeof buildLangChainTools>, name: string) {
  const found = tools.find((t) => (t as { name?: string }).name === name);
  assert.ok(found, `the adapter should expose a "${name}" tool`);
  return found as { invoke: (args: unknown) => Promise<unknown> };
}

describe("the LangChain tool adapter", () => {
  it("exposes every tool in the shared registry", () => {
    const tools = buildLangChainTools({ pool, ownerId: owner });
    const names = tools.map((t) => (t as { name?: string }).name).sort();
    assert.deepEqual(names, registry.map((d) => d.name).sort());
  });

  it("reads through to the owner's goals", async () => {
    const tools = buildLangChainTools({ pool, ownerId: owner });
    const result = await toolNamed(tools, "list_goals").invoke({});

    // Tool results reach the model as text, so the adapter serializes them.
    const goals = JSON.parse(result as string) as Array<{ id: string; title: string }>;
    assert.equal(goals.length, 1);
    assert.equal(goals[0].title, "Run a 5k");
  });

  it("writes through, and reports the write so search can reindex", async () => {
    let mutations = 0;
    const tools = buildLangChainTools({
      pool,
      ownerId: owner,
      onMutation: () => {
        mutations += 1;
      },
    });

    await toolNamed(tools, "create_goal").invoke({ title: "Learn to swim" });

    const { goals } = await repo.getState(pool, owner);
    assert.deepEqual(
      goals.map((g) => g.title).sort(),
      ["Learn to swim", "Run a 5k"]
    );
    assert.equal(mutations, 1, "a write must fire onMutation — otherwise search goes stale");
  });

  it("does not report a read as a write", async () => {
    let mutations = 0;
    const tools = buildLangChainTools({
      pool,
      ownerId: owner,
      onMutation: () => {
        mutations += 1;
      },
    });

    await toolNamed(tools, "list_goals").invoke({});
    assert.equal(mutations, 0);
  });

  it("keeps one owner's tools off another owner's goals", async () => {
    const other = await createOwner(pool, "owner-2");
    const tools = buildLangChainTools({ pool, ownerId: other });

    const result = await toolNamed(tools, "list_goals").invoke({});
    assert.deepEqual(JSON.parse(result as string), []);
  });
});
