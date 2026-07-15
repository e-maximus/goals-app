import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { getPool } from "@/server/pool";
import { createMcpServer } from "@/server/mcp";
import { bearerUser } from "@/server/users";

/**
 * MCP over Streamable HTTP, stateless: a fresh server and transport per request.
 *
 * The SDK ships two transports over the same implementation — a Node one taking
 * `(req, res)`, and this one taking a Web `Request` and returning a `Response`.
 * The web-standard one is what a route handler already speaks, so there is no
 * adapter here on purpose.
 *
 * Stateless because there is no per-connection state worth keeping — the goals
 * live in Postgres — and it means a restart or a second replica can serve the
 * next request without a session handshake. A stateless transport must not be
 * reused across requests (the SDK throws if you try), hence one per call.
 */
export async function POST(request: Request) {
  const pool = await getPool();

  // The MCP surface is per-user: a request must carry a valid personal access
  // token (`Authorization: Bearer <pat>`), and it operates only on that user's
  // goals. No token, or an unknown one, gets nothing — this is what closes the
  // endpoint to the public now that it's internet-reachable.
  const user = await bearerUser(pool, request);
  if (!user) {
    return Response.json(
      {
        jsonrpc: "2.0",
        error: { code: -32001, message: "Unauthorized: a valid Bearer token is required" },
        id: null,
      },
      { status: 401, headers: { "WWW-Authenticate": "Bearer" } }
    );
  }

  const server = createMcpServer(pool, user.id);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  try {
    await server.connect(transport);
    return await transport.handleRequest(request);
  } catch (err) {
    console.error("MCP request failed:", err);
    return Response.json(
      {
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      },
      { status: 500 }
    );
  }
}

// In stateless mode there's no server-initiated stream to attach to and no
// session to delete, so the other two verbs the spec allows are 405s.
function methodNotAllowed() {
  return Response.json(
    {
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed: this MCP server is stateless" },
      id: null,
    },
    { status: 405 }
  );
}

export const GET = methodNotAllowed;
export const DELETE = methodNotAllowed;
