import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import type { Pool } from "../src/db.js";
import type { Comment, Goal } from "../src/domain.js";
import { createMcpServer } from "../src/mcp.js";
import * as repo from "../src/repo.js";
import { reset, setupPool } from "./helpers.js";

let pool: Pool;

before(async () => {
  pool = await setupPool();
});
after(async () => {
  await pool.end();
});

/** A client wired straight to the MCP server — same code path a real agent hits. */
async function connect(): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createMcpServer(pool);
  const client = new Client({ name: "test", version: "1.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

/** Tools answer with a JSON document in a single text block. */
function payload<T>(result: unknown): T {
  const content = (result as { content: { type: string; text: string }[] }).content;
  assert.equal(content[0]!.type, "text");
  return JSON.parse(content[0]!.text) as T;
}

const goal: Goal = {
  id: "goal-podcast",
  title: "Launch my podcast",
  createdAt: 1_700_000_000_000,
  groups: [{ id: "g-1", title: "Preparation", steps: [{ id: "s-1", text: "Pick a name", done: true }] }],
  comments: [{ id: "c-1", text: "Editing takes longer than recording.", createdAt: 1_700_000_100_000 }],
};

beforeEach(async () => {
  await reset(pool);
  await repo.replaceAll(pool, [goal], null);
});

describe("MCP surface", () => {
  it("advertises the goal and comment tools", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();

    assert.deepEqual(names, [
      "add_comment",
      "add_group",
      "add_step",
      "create_goal",
      "delete_comment",
      "delete_goal",
      "delete_group",
      "delete_step",
      "edit_comment",
      "get_goal",
      "list_comments",
      "list_goals",
      "rename_group",
      "toggle_step",
    ]);
    await client.close();
  });

  it("lists goals with progress and a comment count", async () => {
    const client = await connect();
    const result = await client.callTool({ name: "list_goals", arguments: {} });
    const goals = payload<{ id: string; progressPct: number; comments: number }[]>(result);

    assert.equal(goals.length, 1);
    assert.equal(goals[0]!.id, "goal-podcast");
    assert.equal(goals[0]!.progressPct, 100); // the one step is done
    assert.equal(goals[0]!.comments, 1);
    await client.close();
  });

  it("reads a goal in full, comments included", async () => {
    const client = await connect();
    const result = await client.callTool({
      name: "get_goal",
      arguments: { goalId: "goal-podcast" },
    });
    const fetched = payload<Goal>(result);

    assert.equal(fetched.title, "Launch my podcast");
    assert.equal(fetched.groups[0]!.steps[0]!.text, "Pick a name");
    assert.equal(fetched.comments![0]!.text, "Editing takes longer than recording.");
    await client.close();
  });

  it("adds a comment that lands in the store", async () => {
    const client = await connect();
    const result = await client.callTool({
      name: "add_comment",
      arguments: { goalId: "goal-podcast", text: "Try a shorter script next time." },
    });
    const added = payload<Comment>(result);
    assert.equal(added.text, "Try a shorter script next time.");

    // The real assertion: it's in Postgres, where the web app will read it.
    const stored = await repo.listComments(pool, "goal-podcast");
    assert.deepEqual(stored.map((c) => c.text), [
      "Try a shorter script next time.",
      "Editing takes longer than recording.",
    ]);
    await client.close();
  });

  it("creates a goal, groups it, and marks a step done", async () => {
    const client = await connect();

    const created = payload<Goal>(
      await client.callTool({
        name: "create_goal",
        arguments: { title: "Learn to sail", why: "Been putting it off for years" },
      })
    );
    const group = payload<{ id: string }>(
      await client.callTool({
        name: "add_group",
        arguments: { goalId: created.id, title: "Basics" },
      })
    );
    const step = payload<{ id: string; done: boolean }>(
      await client.callTool({
        name: "add_step",
        arguments: { groupId: group.id, text: "Book a taster lesson" },
      })
    );
    assert.equal(step.done, false);

    const toggled = payload<{ done: boolean }>(
      await client.callTool({ name: "toggle_step", arguments: { stepId: step.id } })
    );
    assert.equal(toggled.done, true);

    const stored = await repo.getGoal(pool, created.id);
    assert.equal(stored.why, "Been putting it off for years");
    assert.equal(stored.groups[0]!.steps[0]!.done, true);
    await client.close();
  });

  it("reports a missing goal as an error rather than an empty result", async () => {
    const client = await connect();
    const result = await client.callTool({ name: "get_goal", arguments: { goalId: "nope" } });

    assert.equal((result as { isError?: boolean }).isError, true);
    await client.close();
  });

  it("exposes the whole store as a resource", async () => {
    const client = await connect();
    const { contents } = await client.readResource({ uri: "goals://all" });

    const entry = contents[0]!;
    assert.ok("text" in entry, "the goals resource is text, not a blob");
    const goals = JSON.parse(entry.text as string) as Goal[];
    assert.equal(goals[0]!.id, "goal-podcast");
    await client.close();
  });
});
