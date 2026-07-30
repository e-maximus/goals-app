import { currentUserReadonly } from "@/server/current-user";
import { subscribe } from "@/server/events";

/**
 * `GET /api/goals/stream` — Server-Sent Events telling a tab that its goals
 * changed somewhere else: another tab, the AI chat, or an agent over MCP.
 *
 * This is one of the few things a route handler is still for here (see
 * AGENTS.md): a long-lived stream is not something a Server Action can be. It
 * carries no state — only `{ updatedAt }` — and the client answers by reloading
 * through the store's normal `load()`. Keeping state off the wire means the
 * stream can never disagree with the loader about what the goals are.
 *
 * It holds no database connection for its lifetime: the owner is resolved once
 * up front, and everything after that is an in-memory subscription. A stream
 * that parked a pooled client would exhaust the pool at a couple of dozen open
 * tabs.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** How long a client should wait before reconnecting, in ms. */
const RETRY_MS = 5_000;
/**
 * A comment keeps proxies from reaping the connection as idle (60s is the usual
 * cutoff). One timer per connection: Node timers are cheap enough that a shared
 * ticker would be complexity bought with nothing.
 */
const HEARTBEAT_MS = 25_000;

function frame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET(request: Request): Promise<Response> {
  // Read-only: minting an account is the proxy's job on a page navigation, and a
  // stream opened without a session is a bug in the caller, not a new visitor.
  // A non-200 also stops EventSource from reconnecting, so an anonymous caller
  // retries forever nowhere.
  const current = await currentUserReadonly();
  if (!current) return new Response("No session", { status: 401 });

  const ownerId = current.user.id;
  const encoder = new TextEncoder();

  let unsubscribe: (() => void) | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const close = () => {
    unsubscribe?.();
    unsubscribe = undefined;
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = undefined;
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // The client is gone and the controller is already closed; stop
          // writing to it rather than letting the error escape into the write
          // that published this event.
          close();
        }
      };

      send(`retry: ${RETRY_MS}\n\n`);
      unsubscribe = subscribe(ownerId, (updatedAt) => send(frame("goals-changed", { updatedAt })));

      heartbeat = setInterval(() => send(":\n\n"), HEARTBEAT_MS);
      // Don't let an open stream hold a shutting-down process open.
      heartbeat.unref?.();

      // `cancel` covers the reader going away; abort covers the request being
      // torn down underneath it. Either one must drop the subscription.
      request.signal.addEventListener("abort", () => {
        close();
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      });
    },

    cancel() {
      close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      // `no-transform` matters as much as `no-cache`: a proxy that gzips the
      // response buffers it, and buffered events arrive in clumps or not at all.
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
