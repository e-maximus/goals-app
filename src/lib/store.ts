"use client";

import { toast } from "sonner";
import { create } from "zustand";
import {
  isTaskDone,
  utcMidnight,
  type Goal,
  type GoalStatus,
  type ServerState,
  type Step,
  type Task,
} from "./types";
// The store is app-global client state — goals, tasks, save status — shared by
// the goals and tasks views, the chat drawer and the topbar, which is why it
// sits in `lib` rather than inside one feature. Its transport is the goals
// feature's Server Actions; that single upward import is deliberate, and the
// wire types it moves live in ./types so the server never imports a client
// module for them.
import { SyncConflictError, fetchState, pushState } from "@/features/goals/sync";

// A short id for optimistically-created goals/steps/tasks, kept in sync with the
// server's generator (src/server/domain.ts). Six base-36 chars keep goal URLs
// short; collisions are vanishingly unlikely at this app's scale.
function uid(): string {
  return Math.random().toString(36).slice(2, 8).padEnd(6, "0");
}

/**
 * Stamp a goal as just-touched. Applied by every mutating action to the one
 * goal it changed — and only that one — so per-goal activity survives the
 * whole-store save (the server persists these stamps verbatim).
 */
function touched(goal: Goal): Goal {
  return { ...goal, updatedAt: Date.now() };
}

/**
 * Apply `fn` to the step list a target lives in: the goal's own ungrouped
 * steps when `groupId` is null, or the named group's steps otherwise.
 */
function withSteps(goal: Goal, groupId: string | null, fn: (steps: Step[]) => Step[]): Goal {
  if (groupId === null) return { ...goal, steps: fn(goal.steps ?? []) };
  return {
    ...goal,
    groups: goal.groups.map((gr) => (gr.id === groupId ? { ...gr, steps: fn(gr.steps) } : gr)),
  };
}

/**
 * Move the item with `id` one position up or down. Returns the same array when
 * the move is a no-op (unknown id, or already at the edge) so callers can skip
 * the update entirely.
 */
function moveItem<T extends { id: string }>(items: T[], id: string, delta: -1 | 1): T[] {
  const from = items.findIndex((item) => item.id === id);
  const to = from + delta;
  if (from === -1 || to < 0 || to >= items.length) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

/**
 * Where the goals load stands. The store no longer keeps a local copy — the
 * goals live on the server, so until the first fetch lands there is nothing to
 * show, and a failed fetch is a real error state rather than a fallback to
 * whatever was in this browser.
 */
export type LoadStatus = "loading" | "ready" | "error";

/** Whether the last change has made it to the server. Drives the header dot. */
export type SaveStatus = "saved" | "saving" | "error";

type StoreState = {
  goals: Goal[];
  tasks: Task[];
  /**
   * UTC midnight of the last day a plan was settled for (see ServerState). It
   * rides along with the goals rather than having a transport of its own: it is
   * loaded, saved and reconciled by exactly the same paths.
   */
  dayPlannedOn: number | undefined;
  loadStatus: LoadStatus;
  saveStatus: SaveStatus;
  /** The server version our goals are based on — sent back to detect conflicts. */
  serverUpdatedAt: number | null;

  /** Load the goals from the server. Called once on mount; safe to call again to retry. */
  load: () => Promise<void>;
  /**
   * Hard-replace goals/tasks with the server's copy, dropping any local edits.
   * Unlike `load` (which keeps local-only items ahead of the server's), this is a
   * clean overwrite — used after the AI chat's agent mutated the store
   * server-side, so the client adopts the server's version wholesale, exactly as
   * the conflict path does.
   */
  reloadFromServer: () => Promise<void>;
  /**
   * Seed the store from state the server already loaded (RSC initial render),
   * skipping the client fetch entirely. Used when the page was server-rendered
   * for a known user; the first-visit path (no session yet) still calls `load`.
   */
  hydrate: (state: ServerState) => void;
  /**
   * A write to this user's goals landed on the server, and `updatedAt` is the
   * stamp it produced — pushed by the goals stream (SSE). Reconciles by
   * reloading, but only when the change is genuinely someone else's and no local
   * edit is waiting to be saved; see `reconcileRemote`.
   */
  onRemoteChange: (updatedAt: number) => void;
  /**
   * The goals stream (re)connected, so anything written while it was down was
   * never announced. Reconciles the same way, but on no particular stamp.
   */
  requestResync: () => void;

  addGoal: (title: string, why?: string, dueDate?: number) => Goal;
  updateGoal: (goalId: string, title: string, why?: string, dueDate?: number) => void;
  /**
   * Move a goal to sit right before or after another goal in the list. The
   * dashboard sections are filtered views of the one list, so reordering
   * against a visible neighbour keeps the move meaningful within its section.
   */
  reorderGoal: (goalId: string, targetId: string, position: "before" | "after") => void;
  /** Pause or resume a goal. Pausing records when; resuming clears it. */
  setGoalStatus: (goalId: string, status: GoalStatus) => void;
  addGroup: (goalId: string, title: string, dueDate?: number) => void;
  renameGroup: (goalId: string, groupId: string, title: string, dueDate?: number) => void;
  /** Move a group one position up (-1) or down (+1) in the goal's group list. */
  moveGroup: (goalId: string, groupId: string, delta: -1 | 1) => void;
  /** Move a step one position up (-1) or down (+1) within its list. */
  moveStep: (goalId: string, groupId: string | null, stepId: string, delta: -1 | 1) => void;
  // Step actions take `groupId: null` for a step living directly on the goal.
  addStep: (
    goalId: string,
    groupId: string | null,
    text: string,
    description?: string,
    dueDate?: number
  ) => void;
  editStep: (
    goalId: string,
    groupId: string | null,
    stepId: string,
    text: string,
    description?: string,
    dueDate?: number
  ) => void;
  toggleStep: (goalId: string, groupId: string | null, stepId: string) => void;
  deleteGoal: (goalId: string) => void;
  deleteGroup: (goalId: string, groupId: string) => void;
  deleteStep: (goalId: string, groupId: string | null, stepId: string) => void;
  addNote: (goalId: string, text: string, stepId?: string) => void;
  editNote: (goalId: string, noteId: string, text: string, stepId?: string) => void;
  deleteNote: (goalId: string, noteId: string) => void;

  // Task actions. Tasks live next to the goals: linking one to a goal is
  // optional and never feeds that goal's progress.
  /** Returns the created task, so a caller that has to act on it (the day
   *  picker, capturing something straight into today) has its id. */
  addTask: (
    title: string,
    options?: {
      description?: string;
      goalId?: string;
      daily?: boolean;
      dueDate?: number;
      plannedFor?: number;
    }
  ) => Task;
  editTask: (
    taskId: string,
    title: string,
    options?: { description?: string; goalId?: string; daily?: boolean; dueDate?: number }
  ) => void;
  /** Flip a task's done state. For a daily task that means done *today*. */
  toggleTask: (taskId: string) => void;
  deleteTask: (taskId: string) => void;

  // Day-plan actions. A plan is a decision: these write `plannedFor` on the
  // tasks the user chose, and nothing here ever moves an unfinished day forward
  // on its own.
  /**
   * Make exactly `taskIds` the plan for `day` (a UTC midnight): anything else
   * planned for that day is taken back out. This is what committing the picker
   * does, so re-committing an adjusted plan can't leave a stray behind.
   */
  planTasks: (taskIds: string[], day: number) => void;
  /** Put one task into `day`'s plan, leaving the rest of that day alone. */
  planTask: (taskId: string, day: number) => void;
  /** Take a task back out of whatever day it was planned for. */
  unplanTask: (taskId: string) => void;
  /** Record that the user has settled `day` — by starting it or by skipping it. */
  settleDay: (day: number) => void;
};

export const useStore = create<StoreState>((set) => ({
  goals: [],
  tasks: [],
  dayPlannedOn: undefined,
  loadStatus: "loading",
  saveStatus: "saved",
  serverUpdatedAt: null,

  load: async () => {
    set({ loadStatus: "loading" });
    try {
      const state = await fetchState();
      // Applying server data — flag it so the persistence subscriber doesn't
      // immediately echo the just-loaded goals back to the server as a "save".
      applyingRemote = true;
      // A goal created before this load resolved isn't on the server yet (and the
      // subscriber ignores mutations made while loading, so no push was queued for
      // it). Keep such local-only goals ahead of the server's rather than letting
      // the load clobber them, and persist them below.
      let localOnly: Goal[] = [];
      let localOnlyTasks: Task[] = [];
      set((s) => {
        const serverIds = new Set(state.goals.map((g) => g.id));
        localOnly = s.goals.filter((g) => !serverIds.has(g.id));
        const serverTaskIds = new Set(state.tasks.map((t) => t.id));
        localOnlyTasks = s.tasks.filter((t) => !serverTaskIds.has(t.id));
        return {
          goals: [...localOnly, ...state.goals],
          tasks: [...localOnlyTasks, ...state.tasks],
          dayPlannedOn: state.dayPlannedOn,
          serverUpdatedAt: state.updatedAt,
          loadStatus: "ready",
        };
      });
      applyingRemote = false;
      if (localOnly.length > 0 || localOnlyTasks.length > 0) void pushToServer();
    } catch {
      set({ loadStatus: "error" });
    }
  },

  reloadFromServer: async () => {
    try {
      const state = await fetchState();
      applyingRemote = true;
      try {
        set({
          goals: state.goals,
          tasks: state.tasks,
          dayPlannedOn: state.dayPlannedOn,
          serverUpdatedAt: state.updatedAt,
          loadStatus: "ready",
        });
      } finally {
        applyingRemote = false;
      }
    } catch {
      // Transient fetch error — keep the current view; the next successful load
      // reconciles. Don't blow the store away over a blip.
    }
  },

  hydrate: (state) => {
    // Applying server data — guard so the persistence subscriber doesn't echo the
    // just-seeded goals straight back to the server as a "save".
    applyingRemote = true;
    set({
      goals: state.goals,
      tasks: state.tasks,
      dayPlannedOn: state.dayPlannedOn,
      serverUpdatedAt: state.updatedAt,
      loadStatus: "ready",
    });
    applyingRemote = false;
  },

  onRemoteChange: (updatedAt) => {
    pendingRemoteUpdatedAt = Math.max(pendingRemoteUpdatedAt ?? 0, updatedAt);
    scheduleReconcile();
  },

  requestResync: () => {
    resyncRequested = true;
    scheduleReconcile();
  },

  addGoal: (title, why, dueDate) => {
    const now = Date.now();
    const goal: Goal = {
      id: uid(),
      title: title.trim(),
      why: why?.trim() || undefined,
      dueDate,
      steps: [],
      groups: [],
      createdAt: now,
      updatedAt: now,
      status: "active",
    };
    set((s) => ({ goals: [goal, ...s.goals] }));
    return goal;
  },

  updateGoal: (goalId, title, why, dueDate) => {
    const next = title.trim();
    if (!next) return;
    set((s) => ({
      goals: s.goals.map((g) =>
        // An empty `why` clears it (matching addGoal); an absent dueDate clears
        // the deadline — the edit dialog always submits the full picture.
        g.id === goalId ? touched({ ...g, title: next, why: why?.trim() || undefined, dueDate }) : g
      ),
    }));
  },

  reorderGoal: (goalId, targetId, position) =>
    set((s) => {
      const from = s.goals.findIndex((g) => g.id === goalId);
      if (from === -1 || goalId === targetId) return {};
      const goals = [...s.goals];
      const [moved] = goals.splice(from, 1);
      const target = goals.findIndex((g) => g.id === targetId);
      if (target === -1) return {};
      // Reordering isn't goal activity, so no touched() — the push subscriber
      // still picks up the new array and persists the order.
      goals.splice(position === "before" ? target : target + 1, 0, moved!);
      return { goals };
    }),

  setGoalStatus: (goalId, status) =>
    set((s) => ({
      goals: s.goals.map((g) =>
        g.id === goalId
          ? touched({
              ...g,
              status,
              // Present only while paused; cleared on resume (see Goal.pausedAt).
              pausedAt: status === "paused" ? Date.now() : undefined,
            })
          : g
      ),
    })),

  addGroup: (goalId, title, dueDate) =>
    set((s) => ({
      goals: s.goals.map((g) =>
        g.id === goalId
          ? touched({
              ...g,
              groups: [
                ...g.groups,
                { id: uid(), title: title.trim(), steps: [], ...(dueDate ? { dueDate } : {}) },
              ],
            })
          : g
      ),
    })),

  renameGroup: (goalId, groupId, title, dueDate) => {
    const next = title.trim();
    if (!next) return;
    set((s) => ({
      goals: s.goals.map((g) =>
        g.id === goalId
          ? touched({
              ...g,
              groups: g.groups.map((gr) =>
                // The dialog always submits the full picture, so an absent
                // dueDate clears the deadline.
                gr.id === groupId ? { ...gr, title: next, dueDate } : gr
              ),
            })
          : g
      ),
    }));
  },

  moveGroup: (goalId, groupId, delta) =>
    set((s) => ({
      goals: s.goals.map((g) => {
        if (g.id !== goalId) return g;
        const groups = moveItem(g.groups, groupId, delta);
        return groups === g.groups ? g : touched({ ...g, groups });
      }),
    })),

  moveStep: (goalId, groupId, stepId, delta) =>
    set((s) => ({
      goals: s.goals.map((g) => {
        if (g.id !== goalId) return g;
        const next = withSteps(g, groupId, (steps) => moveItem(steps, stepId, delta));
        // withSteps always rebuilds the goal; compare the inner list to detect
        // a no-op move (already at the edge) and skip the touch + push.
        const before = groupId === null ? (g.steps ?? []) : g.groups.find((gr) => gr.id === groupId)?.steps;
        const after = groupId === null ? next.steps : next.groups.find((gr) => gr.id === groupId)?.steps;
        return before === after ? g : touched(next);
      }),
    })),

  addStep: (goalId, groupId, text, description, dueDate) => {
    const desc = description?.trim() || undefined;
    set((s) => ({
      goals: s.goals.map((g) =>
        g.id === goalId
          ? touched(
              withSteps(g, groupId, (steps) => [
                ...steps,
                {
                  id: uid(),
                  text: text.trim(),
                  ...(desc ? { description: desc } : {}),
                  done: false,
                  ...(dueDate ? { dueDate } : {}),
                },
              ])
            )
          : g
      ),
    }));
  },

  editStep: (goalId, groupId, stepId, text, description, dueDate) => {
    const next = text.trim();
    if (!next) return;
    // An empty description clears it, matching addStep's treatment of the
    // field; likewise an absent dueDate clears the deadline.
    const desc = description?.trim() || undefined;
    set((s) => ({
      goals: s.goals.map((g) =>
        g.id === goalId
          ? touched(
              withSteps(g, groupId, (steps) =>
                steps.map((step) =>
                  step.id === stepId ? { ...step, text: next, description: desc, dueDate } : step
                )
              )
            )
          : g
      ),
    }));
  },

  toggleStep: (goalId, groupId, stepId) =>
    set((s) => ({
      goals: s.goals.map((g) =>
        g.id === goalId
          ? touched(
              withSteps(g, groupId, (steps) =>
                steps.map((step) => (step.id === stepId ? { ...step, done: !step.done } : step))
              )
            )
          : g
      ),
    })),

  deleteGoal: (goalId) =>
    set((s) => ({
      goals: s.goals.filter((g) => g.id !== goalId),
      // Tasks pointing at the deleted goal are kept, just unlinked — matching
      // the server's ON DELETE SET NULL.
      tasks: s.tasks.map((t) => (t.goalId === goalId ? { ...t, goalId: undefined } : t)),
    })),

  deleteGroup: (goalId, groupId) =>
    set((s) => ({
      goals: s.goals.map((g) =>
        g.id === goalId ? touched({ ...g, groups: g.groups.filter((gr) => gr.id !== groupId) }) : g
      ),
    })),

  deleteStep: (goalId, groupId, stepId) =>
    set((s) => ({
      goals: s.goals.map((g) =>
        g.id === goalId
          ? touched(withSteps(g, groupId, (steps) => steps.filter((step) => step.id !== stepId)))
          : g
      ),
    })),

  addNote: (goalId, text, stepId) => {
    const next = text.trim();
    if (!next) return;
    set((s) => ({
      goals: s.goals.map((g) =>
        g.id === goalId
          ? touched({
              ...g,
              // Newest first, so the latest thought is the one you see.
              notes: [
                { id: uid(), text: next, createdAt: Date.now(), ...(stepId ? { stepId } : {}) },
                ...(g.notes ?? []),
              ],
            })
          : g
      ),
    }));
  },

  editNote: (goalId, noteId, text, stepId) => {
    const next = text.trim();
    if (!next) return;
    set((s) => ({
      goals: s.goals.map((g) =>
        g.id === goalId
          ? touched({
              ...g,
              notes: (g.notes ?? []).map((n) =>
                // An empty/absent stepId unlinks the note from any step.
                n.id === noteId ? { ...n, text: next, stepId: stepId || undefined } : n
              ),
            })
          : g
      ),
    }));
  },

  deleteNote: (goalId, noteId) =>
    set((s) => ({
      goals: s.goals.map((g) =>
        g.id === goalId
          ? touched({ ...g, notes: (g.notes ?? []).filter((n) => n.id !== noteId) })
          : g
      ),
    })),

  addTask: (title, options = {}) => {
    const desc = options.description?.trim() || undefined;
    const task: Task = {
      id: uid(),
      title: title.trim(),
      ...(desc ? { description: desc } : {}),
      ...(options.goalId ? { goalId: options.goalId } : {}),
      ...(options.daily ? { daily: true } : {}),
      ...(options.dueDate ? { dueDate: options.dueDate } : {}),
      ...(options.plannedFor ? { plannedFor: options.plannedFor } : {}),
      done: false,
      createdAt: Date.now(),
    };
    set((s) => ({ tasks: [task, ...s.tasks] }));
    return task;
  },

  editTask: (taskId, title, options = {}) => {
    const next = title.trim();
    if (!next) return;
    // The dialog always submits the full picture: an empty description clears
    // it, an absent goalId unlinks, an absent dueDate clears the deadline.
    const desc = options.description?.trim() || undefined;
    set((s) => ({
      tasks: s.tasks.map((t) => {
        if (t.id !== taskId) return t;
        const daily = options.daily ?? false;
        return {
          ...t,
          title: next,
          description: desc,
          goalId: options.goalId || undefined,
          daily: daily || undefined,
          dueDate: options.dueDate,
          // Switching kind resets completion, matching the server's updateTask.
          ...(daily !== (t.daily ?? false) ? { done: false, completedOn: undefined } : {}),
        };
      }),
    }));
  },

  toggleTask: (taskId) =>
    set((s) => ({
      tasks: s.tasks.map((t) => {
        if (t.id !== taskId) return t;
        const next = !isTaskDone(t);
        if (t.daily) return { ...t, completedOn: next ? utcMidnight() : undefined };
        return { ...t, done: next };
      }),
    })),

  deleteTask: (taskId) =>
    set((s) => ({ tasks: s.tasks.filter((t) => t.id !== taskId) })),

  planTasks: (taskIds, day) => {
    const chosen = new Set(taskIds);
    set((s) => ({
      tasks: s.tasks.map((t) => {
        const wanted = chosen.has(t.id);
        // Only this day is rewritten: a task planned for tomorrow is none of
        // today's business.
        if (!wanted && t.plannedFor !== day) return t;
        if (wanted && t.plannedFor === day) return t;
        return { ...t, plannedFor: wanted ? day : undefined };
      }),
    }));
  },

  planTask: (taskId, day) =>
    set((s) => ({
      tasks: s.tasks.map((t) => (t.id === taskId ? { ...t, plannedFor: day } : t)),
    })),

  unplanTask: (taskId) =>
    set((s) => ({
      tasks: s.tasks.map((t) => (t.id === taskId ? { ...t, plannedFor: undefined } : t)),
    })),

  settleDay: (day) => set({ dayPlannedOn: day }),
}));

// ---- persistence ----
//
// The store is optimistic: a mutation updates the goals in place, and a
// debounced push writes the whole store to the server. The server is the source
// of truth — if it moved on under us (an agent editing over MCP), the push comes
// back a conflict and we reload rather than clobber the newer copy.

const PUSH_DEBOUNCE_MS = 1500;

/** Set while we're applying a server response, so the subscriber doesn't push it back. */
let applyingRemote = false;
let pushTimer: ReturnType<typeof setTimeout> | undefined;
// Single-flight: never overlap two saves. A second push that starts while one is
// in flight would send the same baseUpdatedAt and lose the race against our own
// earlier write — a self-inflicted conflict. Chain it instead: mark the store dirty
// and push again, with the fresh serverUpdatedAt, once the current one lands.
let pushing = false;
let pendingPush = false;

async function pushToServer(): Promise<void> {
  if (pushing) {
    pendingPush = true;
    return;
  }
  pushing = true;
  try {
    await pushOnce();
  } finally {
    pushing = false;
    if (pendingPush) {
      pendingPush = false;
      void pushToServer();
    } else {
      // Our own write is settled, so a remote change we held back for it can
      // now be applied without eating an unsaved edit.
      void reconcileRemote();
    }
  }
}

async function pushOnce(): Promise<void> {
  const { goals, tasks, dayPlannedOn, serverUpdatedAt } = useStore.getState();
  useStore.setState({ saveStatus: "saving" });

  try {
    const result = await pushState(goals, tasks, serverUpdatedAt, dayPlannedOn);
    useStore.setState({ serverUpdatedAt: result.updatedAt, saveStatus: "saved" });
  } catch (err) {
    useStore.setState({ saveStatus: "error" });

    if (err instanceof SyncConflictError) {
      toast.error("The goals changed on the server", {
        description: "Someone — or an agent — edited them elsewhere. Reloading the latest.",
      });
      // The server wins: reload and drop the local edit that raced it.
      applyingRemote = true;
      try {
        const state = await fetchState();
        useStore.setState({
          goals: state.goals,
          tasks: state.tasks,
          dayPlannedOn: state.dayPlannedOn,
          serverUpdatedAt: state.updatedAt,
          saveStatus: "saved",
        });
      } catch {
        useStore.setState({ saveStatus: "error" });
      } finally {
        applyingRemote = false;
      }
      return;
    }

    toast.error("Couldn't save your changes", {
      description: "We'll keep trying as you edit. Check your connection.",
    });
  }
}

// Push goal changes to the server, debounced. Runs only in the browser, only
// after the first load, and never for changes we ourselves applied from a server
// response (load or conflict reload).
if (typeof window !== "undefined") {
  useStore.subscribe((state, prev) => {
    if (state.loadStatus !== "ready") return;
    if (
      state.goals === prev.goals &&
      state.tasks === prev.tasks &&
      state.dayPlannedOn === prev.dayPlannedOn
    ) {
      return;
    }
    if (applyingRemote) return;

    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
      // Cleared before the push so `hasUnsavedEdits` reads false from here on:
      // a live timer id would otherwise look like a pending edit forever.
      pushTimer = undefined;
      void pushToServer();
    }, PUSH_DEBOUNCE_MS);
  });
}

// ---- reconciliation with writes made elsewhere ----
//
// The goals stream (src/app/api/goals/stream) says only *that* the server moved
// and to what stamp. Turning that into state is this: reload through the normal
// path, having ruled out the two cases where reloading would be wrong.

const REMOTE_DEBOUNCE_MS = 300;
/**
 * Floor on how often a reload may run. Every reload is a whole-store read, and
 * an agent building a goal over MCP writes it in pieces — a group, then its
 * steps, then a note — seconds apart, which no debounce alone would ever
 * coalesce. The interval bounds that into a steady trickle while still letting a
 * single, isolated change through at debounce speed.
 */
const MIN_RELOAD_INTERVAL_MS = 2_000;

let remoteTimer: ReturnType<typeof setTimeout> | undefined;
/** The newest stamp the stream has announced, until we've caught up with it. */
let pendingRemoteUpdatedAt: number | null = null;
/** Set when the stream reconnected and we can't know what we missed. */
let resyncRequested = false;
let reconciling = false;
let lastReloadAt = 0;

/**
 * Queue a reconcile: after the debounce, and never sooner than
 * {@link MIN_RELOAD_INTERVAL_MS} after the last reload. Every event lands on
 * this one timer, so a burst — however long it runs — costs one reload per
 * interval rather than one per event, and the last event always gets its reload.
 */
function scheduleReconcile(): void {
  const sinceLast = Date.now() - lastReloadAt;
  const delay = Math.max(REMOTE_DEBOUNCE_MS, MIN_RELOAD_INTERVAL_MS - sinceLast);
  clearTimeout(remoteTimer);
  remoteTimer = setTimeout(() => void reconcileRemote(), delay);
}

/** A local edit is written but not yet saved — the debounce or the request. */
function hasUnsavedEdits(): boolean {
  return pushTimer !== undefined || pushing;
}

async function reconcileRemote(): Promise<void> {
  // A reload is already running. Come back after it — dropping this would strand
  // the event that arrived mid-flight until something else happened to nudge us.
  if (reconciling) {
    scheduleReconcile();
    return;
  }

  const target = pendingRemoteUpdatedAt;
  if (target === null && !resyncRequested) return;

  const { serverUpdatedAt, loadStatus } = useStore.getState();

  // Our own write, echoed back to us: the save already gave us this state. A
  // reconnect skips this — there is no stamp to compare, only the possibility
  // of having missed something.
  if (!resyncRequested && target !== null && serverUpdatedAt !== null && target <= serverUpdatedAt) {
    pendingRemoteUpdatedAt = null;
    return;
  }
  // A load is already in flight (or the store is in its error state with a
  // retry of its own); it will land on state at least as new as this.
  if (loadStatus !== "ready") return;
  // An unsaved edit would be clobbered by a reload — `load` keeps local-only
  // *items*, but the server's copy of an item that already exists there wins.
  // The pending push settles it: on success we're current, on conflict it
  // reloads, and either way it calls back here.
  if (hasUnsavedEdits()) return;

  reconciling = true;
  const before = useStore.getState().serverUpdatedAt;
  try {
    await useStore.getState().load();
  } finally {
    reconciling = false;
    // From when the reload *finished*: a slow one shouldn't be followed
    // immediately by the next.
    lastReloadAt = Date.now();
  }

  // Only clear once we've actually caught up: a failed load leaves the target
  // standing so the next event (or push) tries again. A load that answered at
  // all satisfies a reconnect, whatever stamp it came back with.
  const { serverUpdatedAt: reached } = useStore.getState();
  const answered = reached !== null && (before === null || reached >= before);
  if (answered) resyncRequested = false;
  if (target !== null && reached !== null && reached >= target) pendingRemoteUpdatedAt = null;
}
