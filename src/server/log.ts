import "server-only";
/**
 * A tiny structured logger: one JSON object per line to stdout/stderr.
 *
 * Deliberately dependency-free. Railway (and `npm run dev` locally) capture the
 * container's stdout/stderr as-is, so newline-delimited JSON is both greppable
 * in a terminal and parseable by a log pipeline — no logger framework, no
 * transport, no config. `event` names the thing that happened; everything else
 * is context. Keep values primitive and small; never log tokens or request
 * bodies.
 */
type Fields = Record<string, unknown>;

function emit(level: "info" | "error", event: string, fields: Fields): void {
  const line = JSON.stringify({ level, event, time: new Date().toISOString(), ...fields });
  if (level === "error") console.error(line);
  else console.log(line);
}

export const log = {
  info: (event: string, fields: Fields = {}) => emit("info", event, fields),
  error: (event: string, fields: Fields = {}) => emit("error", event, fields),
};

/**
 * Log one HTTP request as it finishes: method, path, status and duration. Pass
 * the millisecond start time from `Date.now()` at the top of the handler. Extra
 * per-route context (userId, the MCP tool called) goes in `extra`.
 */
export function logRequest(
  request: Request,
  status: number,
  startedAt: number,
  extra: Fields = {}
): void {
  const level = status >= 500 ? "error" : "info";
  emit(level, "http_request", {
    method: request.method,
    path: new URL(request.url).pathname,
    status,
    durationMs: Date.now() - startedAt,
    ...extra,
  });
}
