import assert from "node:assert/strict";
import { afterAll, beforeAll, beforeEach, describe, it, vi } from "vitest";
import type { Pool } from "../db";
import { reset, setupPool } from "./helpers";

/**
 * The chat endpoint's signed-in-only gate. The route handler imports
 * `currentUserForRequest` from `@/server/current-user`; we mock that module to
 * return an anonymous user (`clerkUserId: null`) so `isSignedIn` returns false.
 * Both GET and POST must then reject with 403 before touching chat_threads or
 * chat_messages.
 */

const { getMockPool, setMockPool } = vi.hoisted(() => {
  let pool: Pool | null = null;
  return {
    getMockPool: () => pool,
    setMockPool: (p: Pool) => {
      pool = p;
    },
  };
});

vi.mock("@/server/current-user", () => ({
  currentUserForRequest: vi.fn().mockImplementation(async () => ({
    pool: getMockPool(),
    user: {
      id: "anon-1",
      clerkUserId: null,
      sessionToken: "anon-session",
      email: null,
      displayName: null,
      avatar: null,
    },
    setCookie: null,
  })),
}));

// Must come after vi.mock so the handler sees the mocked module.
import { GET, POST } from "@/app/api/chat/route";

let pool: Pool;

beforeAll(async () => {
  pool = await setupPool();
  setMockPool(pool);
});
afterAll(async () => {
  await pool.end();
});
beforeEach(async () => {
  await reset(pool);
  // The anonymous owner the mock returns doesn't exist in the users table —
  // that's fine; the 403 fires before any DB read.
});

describe("chat route gate", () => {
  it("GET returns 403 for an anonymous owner", async () => {
    const res = await GET(new Request("http://localhost/api/chat"));
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.error, "The assistant requires a signed-in account.");
  });

  it("POST returns 403 for an anonymous owner", async () => {
    const res = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: [{ id: "u1", role: "user", parts: [{ type: "text", text: "hello" }] }],
        }),
      })
    );
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.error, "The assistant requires a signed-in account.");
  });

  it("leaves no chat_threads or chat_messages behind for the anonymous owner", async () => {
    // Fire both handlers — neither should touch the DB.
    await GET(new Request("http://localhost/api/chat"));
    await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: [{ id: "u2", role: "user", parts: [{ type: "text", text: "hello again" }] }],
        }),
      })
    );

    const threadCount = await pool.db.chatThread.count({ where: { owner_id: "anon-1" } });
    assert.equal(threadCount, 0);

    const msgCount = await pool.db.chatMessage.count({ where: { owner_id: "anon-1" } });
    assert.equal(msgCount, 0);
  });
});
