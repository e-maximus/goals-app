import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { auth } from "@clerk/nextjs/server";
import { verifyClerkToken } from "@clerk/mcp-tools/next";
import { getPool } from "@/server/pool";
import { createMcpServer } from "@/server/mcp";
import { logRequest } from "@/server/log";
import { getOrCreateUserByClerkId } from "@/server/users";

/**
 * Peek at the JSON-RPC body to name what's being invoked, for logging only.
 * Reads a *clone* so the transport still gets an untouched request; never
 * throws — a body we can't parse just yields no extra context.
 */
async function describeRpc(request: Request): Promise<Record<string, string>> {
  try {
    const body = (await request.clone().json()) as {
      method?: unknown;
      params?: { name?: unknown };
    };
    const rpcMethod = typeof body.method === "string" ? body.method : undefined;
    const tool =
      rpcMethod === "tools/call" && typeof body.params?.name === "string"
        ? body.params.name
        : undefined;
    return { ...(rpcMethod ? { rpcMethod } : {}), ...(tool ? { tool } : {}) };
  } catch {
    return {};
  }
}

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

/**
 * The 401 an unauthorized MCP request gets. Per the MCP authorization spec the
 * `WWW-Authenticate` header points at our protected-resource metadata, which is
 * how the client discovers Clerk as the authorization server and starts the
 * OAuth 2.1 flow (dynamic client registration → authorize → token).
 */
function unauthorized(request: Request): Response {
  const resourceMetadata = new URL(
    "/.well-known/oauth-protected-resource",
    request.url
  ).toString();
  return Response.json(
    {
      jsonrpc: "2.0",
      error: { code: -32001, message: "Unauthorized: a valid OAuth token is required" },
      id: null,
    },
    {
      status: 401,
      headers: { "WWW-Authenticate": `Bearer resource_metadata="${resourceMetadata}"` },
    }
  );
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  const rpc = await describeRpc(request);
  const pool = await getPool();

  // The MCP surface is per-user and OAuth 2.1-protected: a request must carry a
  // Clerk-issued OAuth access token (`Authorization: Bearer <token>`). We verify
  // it against Clerk, resolve the Clerk identity to this app's account, and
  // operate only on that user's goals. No token, or an invalid one, gets a 401
  // that kicks off the OAuth flow.
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const clerkAuth = await auth({ acceptsToken: "oauth_token" });
  const authInfo = verifyClerkToken(clerkAuth, bearer);
  const clerkUserId = authInfo?.extra?.userId as string | undefined;

  if (!clerkUserId) {
    logRequest(request, 401, startedAt, rpc);
    return unauthorized(request);
  }

  const user = await getOrCreateUserByClerkId(pool, clerkUserId);
  const server = createMcpServer(pool, user.id);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  try {
    await server.connect(transport);
    const res = await transport.handleRequest(request);
    logRequest(request, res.status, startedAt, { userId: user.id, ...rpc });
    return res;
  } catch (err) {
    logRequest(request, 500, startedAt, {
      userId: user.id,
      ...rpc,
      error: err instanceof Error ? err.message : String(err),
    });
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
