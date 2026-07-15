<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Working in this repo

Guidance for agents making code changes here. Read this before you start.

## Project shape

One Next.js 16 app (App Router) + React 19, TypeScript, Tailwind v4, shadcn/ui on
Base UI. It serves the UI **and** its own backend, and deploys as a
self-contained server (`output: "standalone"`) to **Railway**, with Postgres
alongside.

- **The UI** — client components under [src/app/](src/app/) and
  [src/components/](src/components/). State is a Zustand store
  ([src/lib/store.ts](src/lib/store.ts)) that loads from and writes to the server;
  it is **not** persisted in the browser. Derived data (progress, counts) is
  computed by pure helpers in [src/lib/types.ts](src/lib/types.ts) — don't store
  what you can derive.
- **The API** — route handlers under [src/app/api/](src/app/api/): `/api/goals`
  (the REST surface the store reads and writes), `/api/health`, and `/api/mcp`
  (an **MCP** endpoint over Streamable HTTP, so an agent can read and edit goals).
- **The server internals** — [src/server/](src/server/): the SQL repo, the MCP
  server, migrations (inlined as strings), and the shared, migrated-and-seeded
  pool ([src/server/pool.ts](src/server/pool.ts)). Data lives in **Postgres**.

The goals live on the server and it is the source of truth. The store is
optimistic — a mutation updates goals in place and a debounced `PUT` writes the
whole store back; a `409` means an agent edited over MCP since the load, so the
client reloads rather than clobber the newer copy. There is **no offline cache**:
no network means a load-error state with a retry, not a stale local copy.

The domain types are the single source of truth for both sides: the UI and the
server both import [src/lib/types.ts](src/lib/types.ts) directly (the server via
[src/server/domain.ts](src/server/domain.ts)). Change a type there and everything
moves together.

`DATABASE_URL` is required for the server to run. Everything runs together with
`docker compose up -d --build`; day to day, `docker compose up -d db` for
Postgres plus `npm run dev` for the app.

All committed and user-facing text is in **English**.

## Before you finish a change — the checklist

1. **Write/update tests.**
   - **End-to-end** ([e2e/](e2e/), Playwright) is the primary safety net for
     user-facing behavior. Match the existing style: `test.describe` blocks,
     role-based locators (`getByRole`, `getByLabel`), assert with
     `expect(...).toBeVisible()`. See
     [e2e/create-goal.spec.ts](e2e/create-goal.spec.ts). Import `test`/`expect`
     from [e2e/fixtures.ts](e2e/fixtures.ts), not `@playwright/test` — an
     automatic fixture resets the store to the seeded goals before each test, so
     every test starts from the same known state. The goals are shared in
     Postgres, so the suite runs **serially**; don't reintroduce parallelism.
   - **Server** changes are covered by [src/server/test/](src/server/test/)
     (vitest, project `server`), which run against a **real Postgres** — the repo
     layer is SQL and transactions, and a mock would only prove the mock was
     called.
2. **Run the same checks CI runs** ([.github/workflows/ci.yml](.github/workflows/ci.yml)).
   The tests need Postgres (`docker compose up -d db`):
   ```bash
   npm run lint
   npm run typecheck
   npm run build          # the standalone build must succeed
   npm run test:server    # vitest against Postgres (TEST_DATABASE_URL, default goals_test)
   npm run test:e2e       # Playwright starts the dev server itself
   ```
   All must pass. Don't leave a test as `.only` — CI fails on it.

## Branching & PRs

- Branch off `main`; don't commit directly to `main`. Open a PR — CI (lint +
  build + server + e2e) must be green before merge.
- Pushing to `main` auto-deploys to **Railway** (via its GitHub integration,
  building [Dockerfile](Dockerfile)). Treat `main` as always-releasable, and
  remember a merge changes the live app — including running any new migration
  against the production database.
- Do **not** add AI attribution to git artifacts: no `Co-Authored-By: Claude`
  trailer in commit messages, and no "Generated with Claude Code" line in PR
  descriptions. End at the real content.

## Versioning & releases

Semantic Versioning, interpreted for an app: **PATCH** = fixes, **MINOR** = new
user-facing feature, **MAJOR** = redesign / broken UX. Do **not** hand-edit the
`version` in `package.json`.

### Releases are automatic on merge

Merging a PR into `main` cuts a release automatically
([.github/workflows/auto-release.yml](.github/workflows/auto-release.yml)): it
bumps the version, tags `vx.y.z`, and publishes a GitHub Release. **You do not
run any release command.** Your job is just to set the right bump level via a PR
label:

| PR label        | Effect                                  |
| --------------- | --------------------------------------- |
| _(none)_        | **patch** bump — the default            |
| `release:minor` | new user-facing feature                 |
| `release:major` | redesign / broken UX                    |
| `skip-release`  | merge without any release (docs, chore) |

Add the label that matches your change when you open the PR. The GitHub Release
notes are auto-generated from the merged PRs since the last tag, so: **write a
clear PR title.**

### Manual release (rarely needed)

The same logic is runnable locally for out-of-band releases:

```bash
npm run release               # patch
npm run release minor
npm run release -- minor --push      # also push commit + tag
npm run release -- minor --dry-run   # preview, change nothing
```

It bumps `package.json` + `package-lock.json`, commits as `release: vx.y.z`, and
creates an annotated `vx.y.z` tag. Pushing the tag triggers
[.github/workflows/release.yml](.github/workflows/release.yml), which publishes a
GitHub Release with notes auto-generated from the commits since the previous tag.
(Pass script flags after `--` so npm forwards them.)
