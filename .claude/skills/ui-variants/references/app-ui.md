# The app's UI, condensed

What a mockup has to inherit to read as this product. Read the real file when a
variant leans on one of these; this page is the map, not the source.

## The domain, in one paragraph

A **goal** breaks into **steps**, optionally organized into **groups**; progress
is *derived from steps alone* and never stored. Beside the goals lives a flat
**task** list — one-off to-dos and daily habits. A task may point at a goal
(`goalId`) but **never counts toward that goal's progress**; the mockup must not
imply it does. Goals, groups, steps and one-off tasks each carry an optional
`dueDate`. A daily task resets every day (`completedOn`), so "done" is a property
of today, not of the task.

All of it is in [src/lib/types.ts](../../../src/lib/types.ts) — including the
derived helpers (`todayTasks`, `isTaskDone`, `isTaskOverdue`, `utcMidnight`).
**Derived data is computed, never stored**: if a variant wants a number on
screen, prefer one that falls out of what already exists.

## Screens

| Route      | View                                          | Width |
| ---------- | --------------------------------------------- | ----- |
| `/`        | dashboard — goal grid + a Today block          | `lg`  |
| `/goal/id` | one goal: groups, steps, notes, its tasks       | `xl`  |
| `/tasks`   | the whole task list                            | `md`  |
| `/settings`| account, MCP endpoint                          | `sm`  |

Chrome (topbar, nav, user chip) belongs to the layout
([src/components/layout/](../../../src/components/layout/)), not to a page; a
page only picks its `PageShell` width. Keep the chrome identical across a set.

## Component anatomy to mirror

- **Task row** ([task-row.tsx](../../../src/features/tasks/components/task-row.tsx)) —
  the *whole row* toggles done; the checkbox and the ⋮ menu stop propagation. A
  linked goal renders as a chip on the row (hidden on that goal's own page,
  where it's a given). Done rows go muted + struck through.
- **List card** — rows live inside `rounded-2xl border bg-card shadow-sm`, one
  card per section. Sections are titled by a small uppercase `SectionLabel`
  carrying a count (`Daily · 2/5`, `To-dos · 7`).
- **Due dates** — a `DueBadge`, neutral when ahead, warning when close,
  destructive when overdue.
- **Adding things** — a full-width dashed-border button below the list, not a
  floating action button.
- **Empty states** — centered, dashed circle glyph, a bold line, one sentence of
  explanation, a primary button. See `EmptyState` in
  [tasks-view.tsx](../../../src/features/tasks/components/tasks-view.tsx).
- **Menus and dialogs** are Base UI + shadcn; in a mockup, a plain popover shape
  is enough — don't spend the variant's budget there.

## Tone

Copy is short, lowercase-ish, second person, never cheerful-corporate. Section
labels are nouns with counts. Buttons are verbs (`+ New Task`, `Add task`).
Everything user-facing is English.
