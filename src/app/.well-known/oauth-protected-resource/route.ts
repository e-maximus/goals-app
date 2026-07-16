import {
  metadataCorsOptionsRequestHandler,
  protectedResourceHandlerClerk,
} from "@clerk/mcp-tools/next";

/**
 * OAuth 2.0 Protected Resource Metadata (RFC 9728). This is how an MCP client —
 * the Claude app, say — discovers that `/api/mcp` is protected and which
 * authorization server (Clerk) issues tokens for it. The MCP route's 401 points
 * here via `WWW-Authenticate`, the client fetches this, then runs the OAuth 2.1
 * flow against Clerk. CORS OPTIONS is needed for clients running in a browser.
 */
const handler = protectedResourceHandlerClerk();
const corsHandler = metadataCorsOptionsRequestHandler();

export { handler as GET, corsHandler as OPTIONS };
