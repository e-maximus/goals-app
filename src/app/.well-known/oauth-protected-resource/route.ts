import {
  metadataCorsOptionsRequestHandler,
  protectedResourceHandlerClerk,
} from "@clerk/mcp-tools/next";
import { publicOrigin } from "@/server/http";

/**
 * OAuth 2.0 Protected Resource Metadata (RFC 9728). This is how an MCP client —
 * the Claude app, say — discovers that `/api/mcp` is protected and which
 * authorization server (Clerk) issues tokens for it. The MCP route's 401 points
 * here via `WWW-Authenticate`, the client fetches this, then runs the OAuth 2.1
 * flow against Clerk. CORS OPTIONS is needed for clients running in a browser.
 *
 * `resource` is the identifier a client may echo back when it asks Clerk for a
 * token (RFC 8707), so it has to be the origin the client actually used. Clerk's
 * handler derives it from `request.url` — the container's internal address in
 * production — so we override it per request with the forwarded origin.
 */
const corsHandler = metadataCorsOptionsRequestHandler();

export function GET(request: Request): Response {
  return protectedResourceHandlerClerk({ resource: publicOrigin(request) })(request);
}

export { corsHandler as OPTIONS };
