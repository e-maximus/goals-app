import { test, expect } from "./fixtures";

/**
 * OAuth discovery for the MCP endpoint: the 401 and the protected-resource
 * metadata are the only things an MCP client has to go on, and both publish
 * absolute URLs. They must name the origin the client used — in production the
 * request's own URL is the container's internal address, so a regression here
 * ships `https://0.0.0.0:8080` to every client that asks.
 */
test.describe("MCP OAuth discovery", () => {
  test("advertises the origin the client used, not the server's own address", async ({
    request,
    baseURL,
  }) => {
    const origin = new URL(baseURL!).origin;

    const res = await request.get("/.well-known/oauth-protected-resource");
    expect(res.ok()).toBe(true);

    const metadata = (await res.json()) as {
      resource: string;
      authorization_servers: string[];
    };
    expect(metadata.resource).toBe(origin);
    expect(metadata.authorization_servers[0]).toMatch(/^https:\/\//);
  });

  test("takes the origin from the proxy's forwarded headers", async ({ request }) => {
    // What production looks like: the app is bound to an internal address and a
    // proxy forwards the public one. Locally the two coincide, so the headers
    // are the only way to exercise the case that actually broke.
    const res = await request.get("/.well-known/oauth-protected-resource", {
      headers: { "x-forwarded-host": "mcp.example.test", "x-forwarded-proto": "https" },
    });

    const metadata = (await res.json()) as { resource: string };
    expect(metadata.resource).toBe("https://mcp.example.test");
  });

  test("points an unauthorized request at that same metadata document", async ({
    request,
    baseURL,
  }) => {
    const origin = new URL(baseURL!).origin;

    // No Authorization header: the MCP route answers 401 with the discovery hint.
    const res = await request.post("/api/mcp", {
      data: { jsonrpc: "2.0", method: "tools/list", id: 1 },
      failOnStatusCode: false,
    });

    expect(res.status()).toBe(401);
    expect(res.headers()["www-authenticate"]).toContain(
      `${origin}/.well-known/oauth-protected-resource`
    );
  });
});
