import assert from "node:assert/strict";
import { afterEach, describe, it, vi } from "vitest";
import { log, logRequest } from "../log";

/**
 * The logger just writes one JSON line per event to stdout/stderr — no Postgres
 * needed, so this file stands apart from the repo tests. We capture console and
 * assert the shape the log pipeline (and a human grepping Railway) relies on.
 */
afterEach(() => {
  vi.restoreAllMocks();
});

/** Grab the single JSON object a logging call wrote to the given console fn. */
function captureLine(fn: "log" | "error", run: () => void): Record<string, unknown> {
  const spy = vi.spyOn(console, fn).mockImplementation(() => {});
  run();
  assert.equal(spy.mock.calls.length, 1, `expected one console.${fn} call`);
  return JSON.parse(spy.mock.calls[0]![0] as string);
}

describe("log", () => {
  it("writes info events as JSON to stdout", () => {
    const line = captureLine("log", () => log.info("something_happened", { userId: "u1" }));
    assert.equal(line.level, "info");
    assert.equal(line.event, "something_happened");
    assert.equal(line.userId, "u1");
    assert.equal(typeof line.time, "string");
  });

  it("writes error events to stderr", () => {
    const line = captureLine("error", () => log.error("boom", { error: "nope" }));
    assert.equal(line.level, "error");
    assert.equal(line.event, "boom");
    assert.equal(line.error, "nope");
  });
});

describe("logRequest", () => {
  const req = (method = "POST", url = "http://x/api/mcp") => new Request(url, { method });

  it("records method, path, status and a non-negative duration", () => {
    const line = captureLine("log", () =>
      logRequest(req("POST", "http://x/api/goals"), 200, Date.now(), { userId: "u1", tool: "list_goals" })
    );
    assert.equal(line.event, "http_request");
    assert.equal(line.method, "POST");
    assert.equal(line.path, "/api/goals");
    assert.equal(line.status, 200);
    assert.equal(line.userId, "u1");
    assert.equal(line.tool, "list_goals");
    assert.ok(typeof line.durationMs === "number" && line.durationMs >= 0);
  });

  it("logs 5xx at error level, everything else at info", () => {
    const ok = captureLine("log", () => logRequest(req(), 401, Date.now()));
    assert.equal(ok.level, "info");
    const bad = captureLine("error", () => logRequest(req(), 500, Date.now()));
    assert.equal(bad.level, "error");
  });
});
