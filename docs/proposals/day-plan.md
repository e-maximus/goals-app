# Proposal — The Day Plan

**Status:** ready to implement · **Bump:** `release:minor` (new user-facing feature)

## What we're building

A morning ritual. Once a day the user opens a two-pane planning screen — the day
they're building on the left, everything they could pull into it on the right —
picks a handful of things, and commits. For the rest of the day that collapses to
a quiet list they check off and don't re-edit.

The approved design is **Variant 2 — Morning Ritual**:
<https://claude.ai/code/artifact/a5c0a9fe-6aa6-4718-a19a-848539fb00df>

Build the interaction that mockup shows. It is the specification for layout,
copy and states; this document is the specification for everything behind it.
Two rejected alternatives exist and are worth reading for the tradeoffs they
name — [One List](https://claude.ai/code/artifact/72e40e37-9250-4f31-b459-40b63ddab988),
[By Goal](https://claude.ai/code/artifact/c4650a11-ddd5-4741-9ba7-f0f5a18efc00).

## The one idea to hold onto

**A plan is a decision, not a filter.** Today's list is not "everything due
today" — the app can already compute that, and it isn't a plan. It's the set of
things the user *chose* this morning. That is why this needs a new field and not
a smarter query: `dueDate` says when something must happen, `plannedFor` says
when the user intends to do it, and they are different facts.

Everything below follows from that. In particular: **nothing rolls over on its
own.** An unfinished day stays unfinished until the user moves something forward
by hand. A planner that silently reschedules is a planner whose plan means
nothing.

## Data model

### `Task` gains one field

In [src/lib/types.ts](../../src/lib/types.ts), next to `dueDate`:

```ts
/**
 * The day the user chose to do this, as UTC midnight (epoch ms) — same shape as
 * `completedOn`. Distinct from `dueDate`: a deadline is when it must happen, a
 * plan is when you decided to. Absent means unplanned. Set for daily tasks too
 * when they're picked into a day.
 */
plannedFor?: number;
```

Add the matching helpers there, beside `todayTasks`:

- `isPlannedFor(task, day)` — `task.plannedFor === day`.
- `plannedTasks(tasks, now)` — the day's list, ordered undone-first the way
  `todayTasks` orders (dailies, then dated, then the rest; done sink to the
  bottom).

Keep `todayTasks` — it stays the fallback (see below) and the dashboard strip
still uses it.

### `ServerState` gains one field

```ts
/**
 * UTC midnight of the last day the user settled a plan for — by starting the day
 * or by skipping it. Undefined means they have never planned. This is what
 * decides whether opening /today lands in the picker or in the list; a day with
 * an empty deliberate plan is a real answer and must not be mistaken for an
 * unplanned one.
 */
dayPlannedOn?: number;
```

It rides in `ServerState` rather than getting its own endpoint, because the store
already loads and reconciles that object and this value has the same lifetime.

### Migration `018_task_planned_for`

Append to [src/server/migrations.ts](../../src/server/migrations.ts) — never edit
an existing entry:

```sql
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS planned_for BIGINT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS day_planned_on BIGINT;
CREATE INDEX IF NOT EXISTS tasks_owner_planned_idx ON tasks (owner_id, planned_for);
```

Both nullable, no backfill: every existing user reads as "never planned", which
is the correct state for them.

### Everywhere the field has to be threaded

The write path asserts at compile time that these agree, so miss one and the
build tells you:

- [src/features/goals/schemas.ts](../../src/features/goals/schemas.ts) —
  `plannedFor` on `taskSchema`, `dayPlannedOn` on `saveInputSchema`.
  `SchemaMatchesTask` is what catches a silent drop.
- [src/server/repo.ts](../../src/server/repo.ts) — `insertTasks`, `readTasks`,
  `replaceState`, and the single-task MCP writers.
- [src/server/mcp.ts](../../src/server/mcp.ts) — `plannedFor` in `list_tasks` and
  `get_agenda` output, and accepted by `create_task` / `update_task`. An agent
  should be able to answer "what's my plan for today" and to put something in it.

**Do not** add `plannedFor` to the search index
([embeddings/chunks.ts](../../src/server/embeddings/chunks.ts)). The index is
content; a scheduling decision is not searchable text, and adding it would churn
every task's content hash every morning.

## Behaviour

### Which list is the day

```
the day's list = tasks where plannedFor === utcMidnight(now)
```

One rule, no compounding. With one exception, stated once and implemented in one
place: **if `dayPlannedOn` is not today, the day's list falls back to
`todayTasks(tasks)`** — today's existing behaviour. A user who never opens the
ritual sees exactly what they see now, and the feature is additive rather than a
surface they must adopt to keep working.

### The ritual

`/today` resolves on load:

| `dayPlannedOn` | What renders |
| --- | --- |
| ≠ today | The two-pane picker |
| = today | The committed list, with an **Adjust today** link back to the picker |

Opening the picker **pre-selects the dailies** (they're in the plan unless
removed) and nothing else. The right pane's tabs are: Overdue, Due today,
Dailies, Goal steps, Everything — plus the *Not touched in a while* block, which
surfaces the goal with the oldest `updatedAt` that has an open step. Left from
yesterday appears in the picker as its own group; adding it is one tap and never
automatic.

**Start the day** writes `plannedFor = today` on every chosen task and
`dayPlannedOn = today`. **Skip for today** writes `dayPlannedOn = today` and no
plan — the fallback then applies, and the user isn't asked again until tomorrow.

Removing a task from the plan clears `plannedFor` back to undefined. Moving one
to tomorrow sets `plannedFor` to tomorrow's midnight — which also gives the
evening summary its one action.

### Goal steps in the plan

The picker can list a goal's open steps, but **v1 plans tasks only**. Pulling a
step in creates a task linked to that goal, titled after the step. This is
deliberate: steps are the source of goal progress, and giving them a second
scheduling life means two places can claim a step is "today". Revisit later if
the borrowed-task shape feels wrong in use.

### What a task in a goal's plan does *not* do

It does not move that goal's progress. Progress stays derived from steps alone
(see [types.ts](../../src/lib/types.ts)). The plan may *show* the goal chip on a
row — it must not show a goal's progress bar moving because a linked task got
checked.

## Client

- **Store** ([src/lib/store.ts](../../src/lib/store.ts)) — `dayPlannedOn` in
  state; `planTasks(taskIds, day)`, `unplanTask(taskId)`, `settleDay(day)`. All
  optimistic in-place mutations riding the existing debounced whole-store save;
  do not add a second transport.
- **Feature** — new `src/features/day/` with `components/`, its `index.ts`, and
  `load.ts` if the route needs a server load. Route `src/app/(app)/today/page.tsx`
  stays thin and imports the view. Add **Today** to
  [nav-links.tsx](../../src/components/layout/nav-links.tsx) as the first item
  after Home.
- **Reuse `TaskRow`** ([task-row.tsx](../../src/features/tasks/components/task-row.tsx))
  for the committed list rather than writing a second row component. The picker's
  rows are a new, lighter component — they don't toggle done.
- **Home's Today strip** reads the day's list by the rule above, so a planned day
  shows the plan and an unplanned one shows what it shows today.

## Out of scope

Time-of-day blocking or scheduling. Per-task estimates. Notifications or a
morning reminder. Streaks. Weekly or multi-day planning. Reordering the plan by
drag is in the mockup — ship it if it's cheap on top of the existing list, drop
it if it isn't; the plan's value doesn't depend on its order.

## Tests

- **e2e** ([e2e/day-plan.spec.ts](../../e2e/)) is the safety net that matters
  here. Cover: the picker appears on an unplanned day; picking two things and
  starting the day shows exactly those two; skipping shows the fallback list and
  doesn't ask again; a checked-off planned task stays in the day; **an unfinished
  planned task is not in tomorrow's plan**. Import `test`/`expect` from
  [e2e/fixtures.ts](../../e2e/fixtures.ts) — the store reset is what makes these
  repeatable. The suite is serial; keep it that way.
- **Server** ([src/server/test/](../../src/server/test/), real Postgres) — the
  round trip of `plannedFor` and `dayPlannedOn` through `replaceState`, the MCP
  writers, and that a legacy save with no `dayPlannedOn` doesn't wipe the stored
  one.
- **Isolation** — the diff touches `src/server/`, so run the `tenant-isolation`
  agent. `day_planned_on` lives on `users` and every task query stays scoped by
  `owner_id`; `tasks_owner_planned_idx` is owner-first for that reason.

## Suggested order

Each step should leave the tree green — `npm run lint typecheck build`, then the
two suites (Postgres up: `docker compose up -d db`).

1. Types, Zod schemas, migration, repo threading. No UI. Server tests here.
2. Store actions and `/today` showing the **committed list only**, with the
   fallback. Ship-able on its own: the day already works, it's just not editable.
3. The picker, Start the day, Skip, Adjust today.
4. Evening summary, Left from yesterday, Not touched in a while.
5. MCP surface.
6. e2e across the whole thing, nav entry, dashboard strip.

Branch off fresh `main`, one PR, label it `release:minor`.
