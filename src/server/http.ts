import "server-only";
import * as repo from "./repo";

/**
 * The small response helpers the route handlers share, so each one isn't
 * inventing its own JSON envelope and error mapping.
 */

/** A JSON response, optionally carrying the session cookie a new user was handed. */
export function jsonResponse(
  body: unknown,
  { status = 200, setCookie }: { status?: number; setCookie?: string | null } = {}
): Response {
  const headers = new Headers({ "content-type": "application/json" });
  if (setCookie) headers.append("set-cookie", setCookie);
  return new Response(JSON.stringify(body), { status, headers });
}

/**
 * The repo's domain errors, mapped onto status codes. Anything else is a 500
 * with a generic message — an internal error's text is for the logs, not for
 * the client.
 */
export function errorResponse(err: unknown): Response {
  if (err instanceof repo.NotFoundError) {
    return Response.json({ error: err.message }, { status: 404 });
  }
  if (err instanceof repo.ValidationError) {
    return Response.json({ error: err.message }, { status: 400 });
  }
  return Response.json({ error: "Internal server error" }, { status: 500 });
}
