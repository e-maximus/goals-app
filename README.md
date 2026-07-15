# Goals

Break big things into steps. **Goals** is a small web app for decomposing a
goal into groups of concrete steps, then tracking progress one checkbox at a
time — with an MCP endpoint so an agent can read and edit those goals too.

[![Goals app — dashboard](docs/my-goals.png)](docs/my-goals.png)

## What it does

- Create a goal with an optional "why" to remember your motivation.
- Break each goal into **groups**, and each group into checkable **steps**.
- Watch progress roll up automatically — per group and per goal — with progress
  bars and status labels (Just started / Active / Done).
- Keep a comment feed on each goal for thinking out loud about what's working.
- The goals live on the server (Postgres); a seeded set of example goals shows up
  the first time the server starts against an empty database.

## Tech stack

- **[Next.js 16](https://nextjs.org)** (App Router) + **React 19**
- **TypeScript**
- **Tailwind CSS v4** with **shadcn/ui** components (built on
  **[Base UI](https://base-ui.com)**)
- **lucide-react** icons, **next-themes** for light/dark, **sonner** for toasts
- **Zustand** store, **Postgres** via **[pg](https://node-postgres.com)**
- **MCP** over Streamable HTTP ([@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol))
- Deployed as a self-contained server (`output: "standalone"`) to **Railway**

## Architecture

One app that serves the UI and its own backend.

```
src/
  app/
    layout.tsx          # root layout, fonts, store hydration, Toaster
    page.tsx            # dashboard route (goal list)
    goal/page.tsx       # single-goal detail route (?id=…)
    api/
      goals/route.ts    # GET/PUT the whole store — what the app reads and writes
      health/route.ts   # health probe
      mcp/route.ts      # MCP endpoint (Streamable HTTP) for agents
  components/           # UI: dashboard, goal-detail, group-card, dialogs, topbar
    ui/                 # shadcn/Base UI primitives (button, card, dialog, …)
  lib/
    types.ts            # Goal / Group / Step types + progress helpers (shared)
    store.ts            # Zustand store — loads from and writes to the server
    sync.ts             # the client's fetch/push against /api/goals
    utils.ts            # cn() and helpers
  server/
    db.ts               # pool + migrations runner
    pool.ts             # the shared, migrated-and-seeded pool
    repo.ts             # the SQL repo (all reads and writes)
    mcp.ts              # the MCP server (tools map to the store's actions)
    domain.ts           # re-exports the shared types
    seed.ts             # example data, inserted once on first run
    migrations.ts       # schema migrations, inlined as strings
```

- **The goals live on the server** and it is the source of truth. The store
  ([src/lib/store.ts](src/lib/store.ts)) loads from `/api/goals` on mount and is
  optimistic: a mutation updates goals in place and a debounced `PUT` writes the
  whole store back. If the server moved on since the load (an agent editing over
  MCP), the write comes back a conflict and the client reloads. There is no
  offline cache.
- **Derived progress** (percentages, counts, completion) is computed by pure
  helpers in [src/lib/types.ts](src/lib/types.ts) rather than stored.
- **The domain types are shared, not duplicated** — both the UI and the server
  import [src/lib/types.ts](src/lib/types.ts).

## Getting started

You need Docker (for Postgres) and Node 22+.

```bash
npm install
docker compose up -d db          # Postgres on localhost:5432
DATABASE_URL=postgres://goals:goals@localhost:5432/goals npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Or run the whole thing — app and database — in Docker:

```bash
docker compose up -d --build
curl localhost:3000/api/health
```

### Point an agent at it

The MCP endpoint is at `/api/mcp`. See [.mcp.json](.mcp.json) for a local
Streamable-HTTP client config (`http://localhost:3000/api/mcp`).

## Tests

The tests need Postgres running (`docker compose up -d db`):

```bash
npm run test:server   # vitest against a real Postgres (goals_test)
npm run test:e2e      # Playwright — starts the dev server itself
```

## Build & deploy

```bash
npm run build         # standalone server build → .next/standalone
```

Pushing to `main` deploys to **Railway** (via its GitHub integration), which
builds the [Dockerfile](Dockerfile) and runs the standalone server against a
Postgres provided as `DATABASE_URL`.

## Releases & versioning

Versions follow [Semantic Versioning](https://semver.org): **MAJOR** for a
redesign or broken UX, **MINOR** for a new user-facing feature, **PATCH** for
fixes. Merging a PR into `main` cuts a release automatically — set the bump with
a `release:minor` / `release:major` / `skip-release` label on the PR (no label =
patch). Don't hand-edit the version in `package.json`.

The same logic is runnable locally for out-of-band releases:

```bash
npm run release               # patch bump
npm run release minor         # new feature
npm run release -- minor --push      # also push the commit + tag
npm run release -- minor --dry-run   # preview, change nothing
```
