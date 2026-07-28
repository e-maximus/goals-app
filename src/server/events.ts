import "server-only";

/**
 * The in-process notice board for "this owner's goals changed".
 *
 * The SSE endpoint (src/app/api/goals/stream/route.ts) subscribes a browser tab
 * to its own owner; every write publishes to it. What travels is a *signal*, not
 * data: only the owner's new `goals_updated_at` stamp. The client reloads its
 * store through the usual path, so there is one way to obtain state and no delta
 * format to keep in sync with the domain types. That also makes a dropped
 * connection a non-event — reconnecting *is* the resynchronization, so there is
 * no replay buffer and no `Last-Event-ID` here.
 *
 * It is in-process on purpose. Web writes (Server Actions) and agent writes
 * (MCP) land in the same Node process, so a Map covers every case today. A
 * second replica would not see the first one's writes; the fix then is Postgres
 * `LISTEN/NOTIFY` behind these same two functions (`pg_notify` inside the write
 * transaction is delivered on commit, which is exactly the guarantee
 * {@link recordChange} reimplements here) — not a new service to run.
 *
 * Timing is the subtle part. A listener that hears about a write *before* it
 * commits reads the old state and shows it as the new one. So a write does not
 * publish directly: it records the change against its transaction
 * ({@link recordChange}, from repo's `touch`), and the pool publishes it only
 * once that transaction has committed ({@link flushChanges}, from db.ts).
 */

type Listener = (updatedAt: number) => void;

/**
 * Cached on `globalThis` for the same reason the pool is: a dev-mode hot reload
 * re-evaluates this module, and a fresh Map would strand every open stream's
 * subscription in the old one.
 */
const globalForEvents = globalThis as unknown as {
  goalsListeners?: Map<string, Set<Listener>>;
};
const listeners = (globalForEvents.goalsListeners ??= new Map<string, Set<Listener>>());

/**
 * Listen for writes to one owner's goals. Returns the unsubscribe — callers
 * must run it when their stream ends, or the closure (and the response it
 * writes to) is retained for the life of the process.
 */
export function subscribe(ownerId: string, listener: Listener): () => void {
  const set = listeners.get(ownerId) ?? new Set<Listener>();
  set.add(listener);
  listeners.set(ownerId, set);

  return () => {
    const current = listeners.get(ownerId);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) listeners.delete(ownerId);
  };
}

/**
 * Announce that `ownerId`'s goals are now at `updatedAt`. Only that owner's
 * listeners hear it — the key is the owner id resolved server-side, never
 * anything a client supplied, so a stream can't be pointed at another account.
 *
 * A throwing listener must not take down the write that published, nor the
 * other listeners.
 */
export function publish(ownerId: string, updatedAt: number): void {
  const set = listeners.get(ownerId);
  if (!set) return;
  for (const listener of [...set]) {
    try {
      listener(updatedAt);
    } catch {
      // A dead stream's enqueue throwing is not the writer's problem.
    }
  }
}

/** How many streams are currently listening — for tests and diagnostics. */
export function listenerCount(ownerId?: string): number {
  if (ownerId !== undefined) return listeners.get(ownerId)?.size ?? 0;
  let total = 0;
  for (const set of listeners.values()) total += set.size;
  return total;
}

// ---- publish-on-commit ----
//
// Keyed by the transaction's `Client` object, which is created per transaction
// and handed to the repo functions — so it identifies the in-flight transaction
// without threading a context argument through every write. Weak so an
// abandoned transaction can't keep its pending changes alive.

const pending = new WeakMap<object, Map<string, number>>();

/**
 * Note that `scope` (a transaction's client) has bumped `ownerId`'s stamp. The
 * last stamp recorded wins — a transaction that touches an owner twice publishes
 * once, with the stamp the reader will actually see.
 */
export function recordChange(scope: object, ownerId: string, updatedAt: number): void {
  const changes = pending.get(scope) ?? new Map<string, number>();
  changes.set(ownerId, updatedAt);
  pending.set(scope, changes);
}

/** Publish everything recorded against `scope`. Called after its commit. */
export function flushChanges(scope: object): void {
  const changes = pending.get(scope);
  if (!changes) return;
  pending.delete(scope);
  for (const [ownerId, updatedAt] of changes) publish(ownerId, updatedAt);
}

/** Drop everything recorded against `scope`. Called when its transaction rolled back. */
export function discardChanges(scope: object): void {
  pending.delete(scope);
}
