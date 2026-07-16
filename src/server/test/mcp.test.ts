import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import assert from "node:assert/strict";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import type { Pool } from "../db";
import type { Note, Goal } from "../domain";
import { createMcpServer } from "../mcp";
import * as repo from "../repo";
import { createOwner, reset, setupPool } from "./helpers";

let pool: Pool;
let owner: string;

beforeAll(async () => {
  pool = await setupPool();
});
afterAll(async () => {
  await pool.end();
});

/** A client wired straight to the MCP server — same code path a real agent hits. */
async function connect(): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createMcpServer(pool, owner);
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
  notes: [{ id: "c-1", text: "Editing takes longer than recording.", createdAt: 1_700_000_100_000 }],
};

beforeEach(async () => {
  await reset(pool);
  owner = await createOwner(pool);
  await repo.replaceAll(pool, owner, [goal], null);
});

describe("MCP surface", () => {
  it("advertises the goal and note tools", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();

    assert.deepEqual(names, [
      "add_group",
      "add_note",
      "add_step",
      "create_goal",
      "delete_goal",
      "delete_group",
      "delete_note",
      "delete_step",
      "edit_note",
      "edit_step",
      "get_goal",
      "list_goals",
      "list_notes",
      "rename_group",
      "set_goal_status",
      "toggle_step",
      "update_goal",
    ]);
    await client.close();
  });

  it("renames a goal in place, keeping everything under it", async () => {
    const client = await connect();
    const updated = payload<Goal>(
      await client.callTool({
        name: "update_goal",
        arguments: { goalId: "goal-podcast", title: "Launch the show" },
      })
    );

    assert.equal(updated.title, "Launch the show");
    // The point of having this tool at all: no collateral damage.
    assert.equal(updated.groups[0]!.steps[0]!.text, "Pick a name");
    assert.equal(updated.notes!.length, 1);
    await client.close();
  });

  it("rejects an update that asks for no change", async () => {
    const client = await connect();
    const result = await client.callTool({
      name: "update_goal",
      arguments: { goalId: "goal-podcast" },
    });

    assert.equal((result as { isError?: boolean }).isError, true);
    await client.close();
  });

  it("edits a step's text and leaves it done", async () => {
    const client = await connect();
    const edited = payload<{ text: string; done: boolean }>(
      await client.callTool({
        name: "edit_step",
        arguments: { stepId: "s-1", text: "Pick a name for the show" },
      })
    );

    assert.equal(edited.text, "Pick a name for the show");
    assert.equal(edited.done, true);
    await client.close();
  });

  it("adds a step with a description and can clear it", async () => {
    const client = await connect();
    const added = payload<{ id: string; text: string; description?: string }>(
      await client.callTool({
        name: "add_step",
        arguments: { groupId: "g-1", text: "Record ep. 2", description: "Guest: Alex" },
      })
    );
    assert.equal(added.text, "Record ep. 2");
    assert.equal(added.description, "Guest: Alex");

    // An empty description clears it, leaving the title alone.
    const cleared = payload<{ text: string; description?: string }>(
      await client.callTool({
        name: "edit_step",
        arguments: { stepId: added.id, description: "" },
      })
    );
    assert.equal(cleared.text, "Record ep. 2");
    assert.equal(cleared.description, undefined);
    await client.close();
  });

  it("rejects an edit_step that asks for no change", async () => {
    const client = await connect();
    const result = await client.callTool({ name: "edit_step", arguments: { stepId: "s-1" } });
    assert.equal((result as { isError?: boolean }).isError, true);
    await client.close();
  });

  it("lists goals with progress, a note count, status and activity", async () => {
    const client = await connect();
    const result = await client.callTool({ name: "list_goals", arguments: {} });
    const goals = payload<
      { id: string; progressPct: number; notes: number; status: string; updatedAt: number }[]
    >(result);

    assert.equal(goals.length, 1);
    assert.equal(goals[0]!.id, "goal-podcast");
    assert.equal(goals[0]!.progressPct, 100); // the one step is done
    assert.equal(goals[0]!.notes, 1);
    assert.equal(goals[0]!.status, "active");
    assert.equal(goals[0]!.updatedAt, goal.createdAt); // untouched since the seed
    await client.close();
  });

  it("pauses and resumes a goal", async () => {
    const client = await connect();

    const paused = payload<Goal>(
      await client.callTool({
        name: "set_goal_status",
        arguments: { goalId: "goal-podcast", status: "paused" },
      })
    );
    assert.equal(paused.status, "paused");
    assert.ok(paused.pausedAt! > 0);

    const resumed = payload<Goal>(
      await client.callTool({
        name: "set_goal_status",
        arguments: { goalId: "goal-podcast", status: "active" },
      })
    );
    assert.equal(resumed.status, "active");
    assert.equal(resumed.pausedAt, undefined);
    await client.close();
  });

  it("bumps the goal's activity stamp when an agent toggles a step", async () => {
    const client = await connect();
    const before = (await repo.getGoal(pool, owner, "goal-podcast")).updatedAt!;

    await client.callTool({ name: "toggle_step", arguments: { stepId: "s-1" } });

    const after = (await repo.getGoal(pool, owner, "goal-podcast")).updatedAt!;
    assert.ok(after > before);
    await client.close();
  });

  it("reads a goal in full, notes included", async () => {
    const client = await connect();
    const result = await client.callTool({
      name: "get_goal",
      arguments: { goalId: "goal-podcast" },
    });
    const fetched = payload<Goal>(result);

    assert.equal(fetched.title, "Launch my podcast");
    assert.equal(fetched.groups[0]!.steps[0]!.text, "Pick a name");
    assert.equal(fetched.notes![0]!.text, "Editing takes longer than recording.");
    await client.close();
  });

  it("adds a note that lands in the store", async () => {
    const client = await connect();
    const result = await client.callTool({
      name: "add_note",
      arguments: { goalId: "goal-podcast", text: "Try a shorter script next time." },
    });
    const added = payload<Note>(result);
    assert.equal(added.text, "Try a shorter script next time.");

    // The real assertion: it's in Postgres, where the web app will read it.
    const stored = await repo.listNotes(pool, owner, "goal-podcast");
    assert.deepEqual(stored.map((n) => n.text), [
      "Try a shorter script next time.",
      "Editing takes longer than recording.",
    ]);
    await client.close();
  });

  it("links a note to a step, then unlinks it", async () => {
    const client = await connect();
    const added = payload<{ id: string; stepId?: string }>(
      await client.callTool({
        name: "add_note",
        arguments: { goalId: "goal-podcast", text: "About the name", stepId: "s-1" },
      })
    );
    assert.equal(added.stepId, "s-1");

    const unlinked = payload<{ id: string; stepId?: string }>(
      await client.callTool({
        name: "edit_note",
        arguments: { noteId: added.id, stepId: "" },
      })
    );
    assert.equal(unlinked.stepId, undefined);
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

    const stored = await repo.getGoal(pool, owner, created.id);
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
