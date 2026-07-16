import { authServerMetadataHandlerClerk } from "@clerk/mcp-tools/next";

/**
 * OAuth 2.0 Authorization Server Metadata (RFC 8414), proxied from Clerk. Newer
 * MCP clients resolve the authorization server from the protected-resource
 * metadata, but some older ones look here first, so we expose it too. Clerk is
 * the actual authorization server; this just advertises its endpoints.
 */
const handler = authServerMetadataHandlerClerk();

export { handler as GET };
