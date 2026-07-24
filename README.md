# Goals

Break big things into steps. **Goals** is a small web app for decomposing a
goal into groups of concrete steps, then tracking progress one checkbox at a
time — with an in-app AI chat and an MCP endpoint so an agent can read and edit
those goals too.

[![Goals app — dashboard](docs/my-goals.png)](docs/my-goals.png)

## What it does

- Create a goal with an optional "why" to remember your motivation.
- Break each goal into **groups**, and each group into checkable **steps** — or
  add steps straight to the goal. Give a goal, group or step an optional **due
  date**.
- Watch progress roll up automatically — per group and per goal — with progress
  bars and status labels (Just started / Active / Done). Pause a goal to shelve
  it without losing progress.
- Keep a **notes** feed on each goal for thinking out loud about what's working,
  optionally pinning a note to a specific step.
- Track a separate flat list of **tasks** — one-off to-dos and daily habits,
  optionally linked to a goal (but never counted in its progress).
- Ask the built-in **AI chat** to reshape a goal for you — it drives the same
  operations you can, over a shared tool set.
- The goals live on the server (Postgres) and are **private to each visitor** —
  a first-time visitor is given an anonymous account (an httpOnly session
  cookie) and their own copy of the example goals. No sign-up required; sign in
  with **Clerk** to link a durable identity that survives a cleared cookie or a
  new device, and to unlock MCP and AI chat.
- Point an agent at your goals over **MCP**, authorized with **OAuth 2.1** (via
  Clerk) — no token to paste. **Settings** just shows the endpoint URL.

## Tech stack

- **[Next.js 16](https://nextjs.org)** (App Router) + **React 19**
- **TypeScript**
- **Tailwind CSS v4** with **shadcn/ui** components (built on
  **[Base UI](https://base-ui.com)**)
- **lucide-react** icons, **next-themes** for light/dark, **sonner** for toasts,
  **react-day-picker** for due dates
- **[Clerk](https://clerk.com)** for optional sign-in and MCP OAuth
- **Zustand** store, **Postgres** via **[Prisma](https://www.prisma.io)** (over
  the **[pg](https://node-postgres.com)** pool)
- **AI chat** with the **[AI SDK](https://ai-sdk.dev)** (DeepSeek)
- **MCP** over Streamable HTTP ([@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol))
- Deployed as a self-contained server (`output: "standalone"`) to **Railway**

## Architecture

One app that serves the UI and its own backend.

```
src/
  proxy.ts                # Clerk middleware — populates auth; gates nothing
  app/
    layout.tsx            # root layout, fonts, Clerk provider, Toaster
    (app)/                # the signed-in-or-anonymous app shell
      layout.tsx          # server-loads the store and hydrates it
      page.tsx            # home / dashboard (goal list)
      goals/page.tsx      # all goals
      goal/[id]/page.tsx  # single-goal detail route
      tasks/page.tsx      # the flat task list
      settings/page.tsx   # account + MCP endpoint URL
    sign-in, sign-up/     # Clerk auth pages
    about, privacy, terms # static pages
    .well-known/          # OAuth metadata (protected-resource + auth-server)
    api/
      goals/route.ts      # GET/PUT the whole store — scoped to the current user
      me/route.ts         # the current user's id (no token — MCP is OAuth now)
      chat/route.ts       # the AI chat endpoint (AI SDK)
      mcp/route.ts        # MCP endpoint (Streamable HTTP), OAuth 2.1-authorized
      health/route.ts     # health probe
      test/reset/route.ts # env-gated e2e reset to the canonical seed
  components/             # shared UI primitives (ui/) and layout
  features/               # feature modules: goals/, tasks/, chat/, account/
  lib/
    types.ts              # Goal / Group / Step / Note / Task types + helpers
    store.ts              # Zustand store — loads from and writes to the server
    db.ts                 # the Prisma client singleton
    utils.ts              # cn() and helpers
  server/
    pool.ts               # the shared, migrated pool
    db.ts                 # Prisma adapter: model API, transactions, raw queries
    repo.ts               # the repo (all reads and writes, scoped by owner)
    domain.ts             # re-exports the shared types for the server
    tools.ts              # the neutral tool registry (shared by MCP and chat)
    mcp.ts                # the MCP server, built from the tool registry
    chat-agent.ts         # the in-app AI agent, built from the same registry
    chat-repo.ts          # chat threads and messages, scoped by owner
    llm.ts                # the model client the chat agent runs on
    log.ts                # structured request logging
    users.ts              # accounts: per-user seeding, cookie + Clerk auth
    seed.ts               # example data, seeded per user on first visit
    migrations.ts         # schema migrations, inlined as strings
```

- **The goals live on the server** and it is the source of truth. The store
  ([src/lib/store.ts](src/lib/store.ts)) is hydrated on the server in the `(app)`
  layout and is optimistic: a mutation updates goals in place and a debounced
  `PUT` writes the whole store back. If the server moved on since the load (an
  agent editing over MCP), the write comes back a `409` conflict and the client
  reloads rather than clobber the newer copy. There is no offline cache.
- **Every visitor is their own account.** A first request without a session
  cookie mints a user, seeds them their own example goals, and sets an httpOnly
  cookie; every read and write is scoped to that user in the repo
  ([src/server/repo.ts](src/server/repo.ts)). Signing in with Clerk links a
  stable identity to that account.
- **The MCP endpoint is the same store from an agent's side.** It's protected by
  OAuth 2.1: a request must carry a Clerk-issued `Authorization: Bearer
  <oauth_token>`. The endpoint verifies it, resolves the Clerk identity to this
  app's account, and operates only on that user's goals. No token, or an invalid
  one, gets a `401` whose `WWW-Authenticate` points at the protected-resource
  metadata under [.well-known/](src/app/.well-known/) — that's how a client
  discovers Clerk and runs the flow. A stateless Streamable-HTTP transport: a
  fresh server per request, no session to keep.
- **One tool vocabulary.** Both the MCP server and the in-app AI chat build their
  tool surfaces from a single registry ([src/server/tools.ts](src/server/tools.ts)),
  so there's one set of operations, not two. Adding and deleting **steps** and
  **notes** are batched — one call adds or removes several at once, atomically.
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

Signing in and the MCP OAuth flow need Clerk keys
(`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`); the anonymous
cookie path works without them.

### Point an agent at it

The MCP endpoint is at `/api/mcp` and is OAuth 2.1-authorized — a client only
needs the URL. On first use it discovers Clerk from the endpoint's
`WWW-Authenticate` challenge and runs the flow (dynamic client registration →
authorize → token); there's no static token to paste. [.mcp.json](.mcp.json) is
a local Streamable-HTTP example. Or with Claude Code:

```bash
claude mcp add --transport http goals http://localhost:3000/api/mcp
```

An agent can then read and edit goals, groups, steps, notes and tasks — and add
or delete several steps or notes in a single call.

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
fixes. Merging a PR into `main` cuts a release automatically — every merge ships
at least a patch. Set a higher bump with a `release:minor` / `release:major`
label on the PR (no label = patch). Don't hand-edit the version in
`package.json`.

The same logic is runnable locally for out-of-band releases:

```bash
npm run release               # patch bump
npm run release minor         # new feature
npm run release -- minor --push      # also push the commit + tag
npm run release -- minor --dry-run   # preview, change nothing
```
