<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Working in this repo

Guidance for agents making code changes here. Read this before you start.

## Project shape

Two pieces, deliberately kept apart.

**The web app** — Client-side Next.js 16 (App Router) + React 19, TypeScript,
Tailwind v4, shadcn/ui on Base UI. Fully static export → GitHub Pages. State
lives in `localStorage` via a Zustand store ([src/lib/store.ts](src/lib/store.ts)).

- **Keep it static-export friendly: no server actions, no route handlers, no
  runtime env reads.** This still holds — see the note on sync below.
- Derived data (progress, counts) is computed by pure helpers in
  [src/lib/types.ts](src/lib/types.ts) — don't store what you can derive.

**The goals server** ([server/](server/)) — a separate Node workspace with its
own `package.json`, exposing two surfaces over one port: a REST API the web app
optionally syncs against, and an **MCP** endpoint (Streamable HTTP) so an agent
can read and edit goals. Data lives in Postgres. Both run in Docker
([docker-compose.yml](docker-compose.yml)); the web app does **not**.

### How those two coexist without breaking the static export

Sync is **opt-in and entirely client-side**: the user types the server address
into Settings and it's kept in `localStorage` ([src/lib/sync.ts](src/lib/sync.ts)).
There is no build-time backend, no env var baked into the bundle, and nothing
server-rendered. With no address configured — which includes the public GitHub
Pages deployment — the app is the offline, localStorage-only app it always was.
**Don't "simplify" this by adding a route handler or reading `process.env` at
runtime; that would break the deploy.**

The domain types are shared, not duplicated: the server compiles
[src/lib/types.ts](src/lib/types.ts) into its own build. Change a type there and
both sides move together.

All committed and user-facing text is in **English**.

## Before you finish a change — the checklist

1. **Write/update tests.** End-to-end tests in [e2e/](e2e/) (Playwright) are the
   primary safety net. Any user-facing behavior you add or change needs a test.
   - Match the existing style: `test.describe` blocks, role-based locators
     (`getByRole`, `getByLabel`), assert with `expect(...).toBeVisible()`. See
     [e2e/create-goal.spec.ts](e2e/create-goal.spec.ts).
   - Each test starts from a fresh browser context — `localStorage` is empty and
     the app reseeds its example goals, so every test has the same known state.
   - Server changes are covered by [server/test/](server/test/) (`node:test`),
     which run against a **real Postgres** — the repo layer is SQL and
     transactions, and a mock would only prove the mock was called.
2. **Run the same checks CI runs** ([.github/workflows/ci.yml](.github/workflows/ci.yml)):
   ```bash
   npm run lint
   npm run build          # static export must succeed
   npm run test:e2e       # Playwright starts the dev server itself
   ```
   All three must pass. Don't leave a test as `.only` — CI fails on it.

   If you touched [server/](server/):
   ```bash
   docker compose up -d db      # the tests need Postgres
   cd server && npm test        # typecheck + tests
   ```

## Branching & PRs

- Branch off `main`; don't commit directly to `main`. Open a PR — CI (lint +
  build + e2e) must be green before merge.
- Pushing to `main` auto-deploys to GitHub Pages
  ([.github/workflows/deploy.yml](.github/workflows/deploy.yml)). Treat `main` as
  always-releasable.
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
