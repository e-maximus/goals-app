<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Working in this repo

Guidance for agents making code changes here. Read this before you start.

## Project shape

- Client-side Next.js 16 (App Router) + React 19, TypeScript, Tailwind v4,
  shadcn/ui on Base UI. Fully static export → GitHub Pages. No backend; state
  lives in `localStorage` via `StoreProvider` ([src/lib/store.tsx](src/lib/store.tsx)).
- Keep it static-export friendly: no server actions, no route handlers, no
  runtime env reads. Derived data (progress, counts) is computed by pure helpers
  in [src/lib/types.ts](src/lib/types.ts) — don't store what you can derive.
- All committed and user-facing text is in **English**.

## Before you finish a change — the checklist

1. **Write/update tests.** End-to-end tests in [e2e/](e2e/) (Playwright) are the
   primary safety net. Any user-facing behavior you add or change needs a test.
   - Match the existing style: `test.describe` blocks, role-based locators
     (`getByRole`, `getByLabel`), assert with `expect(...).toBeVisible()`. See
     [e2e/create-goal.spec.ts](e2e/create-goal.spec.ts).
   - Each test starts from a fresh browser context — `localStorage` is empty and
     the app reseeds its example goals, so every test has the same known state.
2. **Run the same checks CI runs** ([.github/workflows/ci.yml](.github/workflows/ci.yml)):
   ```bash
   npm run lint
   npm run build          # static export must succeed
   npm run test:e2e       # Playwright starts the dev server itself
   ```
   All three must pass. Don't leave a test as `.only` — CI fails on it.
3. **Record the change** in `CHANGELOG.md` under `## [Unreleased]`
   (`Added` / `Changed` / `Fixed`). One bullet, user-facing, in English.

## Branching & PRs

- Branch off `main`; don't commit directly to `main`. Open a PR — CI (lint +
  build + e2e) must be green before merge.
- Pushing to `main` auto-deploys to GitHub Pages
  ([.github/workflows/deploy.yml](.github/workflows/deploy.yml)). Treat `main` as
  always-releasable.

## Versioning & releases

Semantic Versioning, interpreted for an app (see `CHANGELOG.md` header):
**PATCH** = fixes, **MINOR** = new user-facing feature, **MAJOR** = redesign /
broken UX. Do **not** hand-edit the `version` in `package.json`.

### Releases are automatic on merge

Merging a PR into `main` cuts a release automatically
([.github/workflows/auto-release.yml](.github/workflows/auto-release.yml)): it
bumps the version, updates `CHANGELOG.md`, tags `vx.y.z`, and publishes a GitHub
Release. **You do not run any release command.** Your job is just to set the
right bump level via a PR label:

| PR label        | Effect                                  |
| --------------- | --------------------------------------- |
| _(none)_        | **patch** bump — the default            |
| `release:minor` | new user-facing feature                 |
| `release:major` | redesign / broken UX                    |
| `skip-release`  | merge without any release (docs, chore) |

Add the label that matches your change when you open the PR. The changelog line
is your `## [Unreleased]` notes if you wrote any (preferred — see the checklist),
otherwise the PR title is used as a fallback. So: **write a clear
`[Unreleased]` entry and a clear PR title.**

### Manual release (rarely needed)

The same logic is runnable locally for out-of-band releases:

```bash
npm run release               # patch
npm run release minor
npm run release -- minor --push      # also push commit + tag
npm run release -- minor --dry-run   # preview, change nothing
```

Pushing the tag triggers
[.github/workflows/release.yml](.github/workflows/release.yml), which publishes
the GitHub Release. (Pass script flags after `--` so npm forwards them.)
