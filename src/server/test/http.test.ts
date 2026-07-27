import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { publicOrigin } from "../http";

/**
 * `publicOrigin` decides what absolute URLs we publish to clients — the OAuth
 * discovery metadata above all. No Postgres involved, so this file stands apart
 * from the repo tests. The case that matters is production: behind Railway's
 * proxy the request's own URL is the container's internal address, and shipping
 * that in the metadata points MCP clients at nothing.
 */
function request(url: string, headers: Record<string, string> = {}): Request {
  return new Request(url, { headers });
}

describe("publicOrigin", () => {
  it("prefers the forwarded host and protocol over the internal address", () => {
    const origin = publicOrigin(
      request("http://0.0.0.0:8080/api/mcp", {
        "x-forwarded-host": "keepgoing.you",
        "x-forwarded-proto": "https",
        host: "0.0.0.0:8080",
      })
    );
    assert.equal(origin, "https://keepgoing.you");
  });

  it("takes the first entry when a chain of proxies appended their own", () => {
    const origin = publicOrigin(
      request("http://0.0.0.0:8080/api/mcp", {
        "x-forwarded-host": "keepgoing.you, internal.railway.app",
        "x-forwarded-proto": "https, http",
      })
    );
    assert.equal(origin, "https://keepgoing.you");
  });

  it("falls back to the Host header when nothing was forwarded", () => {
    const origin = publicOrigin(request("http://0.0.0.0:8080/api/mcp", { host: "localhost:3000" }));
    assert.equal(origin, "http://localhost:3000");
  });

  it("falls back to the request's own origin with no host headers at all", () => {
    // `Request` fills in `host` from the URL, so drop it to reach the last resort.
    const bare = new Request("https://example.com/api/mcp");
    bare.headers.delete("host");
    assert.equal(publicOrigin(bare), "https://example.com");
  });
});
