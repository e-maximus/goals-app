import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ServerState } from "../sync";

// The server half is mocked: these tests exercise the store's own push
// scheduling (debounce + single-flight), not the network. The real
// SyncConflictError is kept so the conflict branch stays type-correct.
vi.mock("../sync", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../sync")>();
  return { ...actual, fetchState: vi.fn(), pushState: vi.fn() };
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

// Must match PUSH_DEBOUNCE_MS in the store — advancing past it fires the push.
const DEBOUNCE_MS = 1500;

const serverState = (updatedAt: number): ServerState => ({
  initialized: true,
  updatedAt,
  goals: [],
  tasks: [],
});

describe("store push scheduling", () => {
  let sync: typeof import("../sync");
  let store: typeof import("../store");

  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    // The push subscriber only attaches in a browser (`typeof window`).
    vi.stubGlobal("window", {} as Window & typeof globalThis);
    sync = await import("../sync");
    store = await import("../store");
  });

  it("never overlaps two PUTs, and re-pushes with the fresh version", async () => {
    const pushState = vi.mocked(sync.pushState);
    vi.mocked(sync.fetchState).mockResolvedValue(serverState(100));

    const first = deferred<ServerState>();
    const second = deferred<ServerState>();
    pushState.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    await store.useStore.getState().load();
    expect(store.useStore.getState().serverUpdatedAt).toBe(100);

    // First edit → debounce fires → Push A goes out (base 100), left in flight.
    store.useStore.getState().addGoal("A");
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(pushState).toHaveBeenCalledTimes(1);
    expect(pushState.mock.calls[0]![2]).toBe(100); // baseUpdatedAt

    // A second edit while A is still in flight must NOT start a second PUT —
    // it would race A with the same stale base and self-inflict a 409.
    store.useStore.getState().addGoal("B");
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(pushState).toHaveBeenCalledTimes(1);

    // A lands and bumps the server version. The edit queued meanwhile now goes
    // out as one push, with the fresh base — no conflict.
    first.resolve(serverState(200));
    await flush();
    expect(pushState).toHaveBeenCalledTimes(2);
    expect(pushState.mock.calls[1]![2]).toBe(200);

    second.resolve(serverState(300));
    await flush();
    expect(store.useStore.getState().serverUpdatedAt).toBe(300);
    expect(store.useStore.getState().saveStatus).toBe("saved");
  });
});
