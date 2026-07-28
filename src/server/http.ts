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
 * The origin this request reached us on, as the client sees it.
 *
 * `request.url` is not that origin in production: the standalone server binds
 * `0.0.0.0:8080` inside the container and Railway's proxy forwards to it, so
 * the URL Next hands the handler is the internal one. Anything we *publish* —
 * an absolute URL a client is expected to fetch or match — has to be built from
 * the forwarded headers instead, or we advertise `https://0.0.0.0:8080` to the
 * outside world. Everything else (routing, logging) should keep using
 * `request.url`.
 *
 * `x-forwarded-host` may carry a list if the request crossed several proxies;
 * the first entry is the one the client used. Falls back to `host`, then to the
 * request's own origin, which is what dev and the tests see.
 */
export function publicOrigin(request: Request): string {
  const headers = request.headers;
  const forwardedHost = headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || headers.get("host")?.trim();
  if (!host) return new URL(request.url).origin;

  const proto =
    headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || new URL(request.url).protocol.replace(":", "");
  return `${proto}://${host}`;
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
