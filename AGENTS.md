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
  (the REST surface the store reads and writes), `/api/me` (the current user's id
  and MCP token, plus `rotate-token`), `/api/health`, and `/api/mcp` (an **MCP**
  endpoint over Streamable HTTP, so an agent can read and edit goals).
- **The server internals** — [src/server/](src/server/): the SQL repo, accounts
  ([src/server/users.ts](src/server/users.ts)), the MCP server, migrations
  (inlined as strings), and the shared, migrated pool
  ([src/server/pool.ts](src/server/pool.ts)). Data lives in **Postgres**.

The goals live on the server and it is the source of truth. The store is
optimistic — a mutation updates goals in place and a debounced `PUT` writes the
whole store back; a `409` means an agent edited over MCP since the load, so the
client reloads rather than clobber the newer copy. There is **no offline cache**:
no network means a load-error state with a retry, not a stale local copy.

Everything is **per user**. There is no login: a first-time visitor is minted a
user, seeded their own copy of the example goals, and handed an httpOnly session
cookie ([src/server/users.ts](src/server/users.ts)). Every repo read and write is
scoped by `owner_id`, so ids are globally unique but never cross accounts — mind
this when writing SQL or seeding (the example seed's fixed ids are remapped to
fresh ones per user; only the e2e test user keeps them). The **MCP** endpoint is
the same store for an agent: it requires `Authorization: Bearer <pat>`, resolves
the user from that personal access token, and 401s without a valid one. A user
manages their token (view / copy / rotate) on the **Settings** page.

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

   Working in Claude Code? The `checklist` agent runs all five and returns a
   pass/fail summary instead of the full logs.
3. **If the diff touches `src/server/`, check per-user scoping.** Every query
   must stay inside one owner: `goals`, `tasks` and `users` carry `owner_id` on
   the row; `groups`, `steps` and `notes` reach it through their goal. A query
   filtering on a bare row id leaks across accounts — ids are globally unique.
   In Claude Code, the `tenant-isolation` agent audits the diff for this.

## Branching & PRs

- **Start every task from a fresh `main`.** Before writing any code, this is the
  default flow: `git checkout main`, `git pull origin main`, then branch off it
  (`git checkout -b <name>`). Never start a task from a stale local `main` or from
  whatever branch happens to be checked out — branching off an out-of-date base is
  what produces the merge conflicts you'll fight later.
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

---

# AI Coding Standards for Next.js Application

You are an expert senior frontend engineer specializing in React, Next.js (App Router), TypeScript, and Tailwind CSS. Always write secure, highly optimized, and production-ready code adhering to the following rules.

---

## 1. CORE ARCHITECTURE & ROUTING
- **App Router Only:** Never use Pages Router conventions (`pages/` directory, `getServerSideProps`, `getStaticProps`).
- **Server Components by Default:** All components must be React Server Components (RSC) unless interactivity is required.
- **Client Components:** Use the `'use client'` directive ONLY when using React hooks (`useState`, `useEffect`, context) or event listeners. Keep client components at the leaves of the component tree.
- **Asynchronous Parameters (mandatory in Next.js 16):** `params` and `searchParams` in
  `Page`, `Layout`, and `Route Handlers` are Promises — synchronous access was removed in
  Next.js 16 (along with sync `cookies`/`headers`/`draftMode`). Always await them. Run
  `npx next typegen` to get the generated `PageProps`/`LayoutProps`/`RouteContext` helpers
  instead of hand-writing the prop types:
  ```tsx
  // Correct — server Page/Layout/Route
  export default async function Page(props: PageProps<'/goal/[id]'>) {
    const { id } = await props.params;
    return <div>ID: {id}</div>;
  }
  ```
  In a **client** component, read route params with the `useParams()` hook instead (as in
  [src/app/(app)/goal/[id]/page.tsx](src/app/(app)/goal/[id]/page.tsx)) — the async-props
  rule is for server Page/Layout/Route only.
- **`middleware` → `proxy`:** the `middleware` file/export is deprecated in Next.js 16; the
  convention is now `proxy.ts` (a `proxy` function or a default export), and it runs on the
  `nodejs` runtime only (no `edge`). This repo already uses it — [src/proxy.ts](src/proxy.ts)
  default-exports Clerk's `clerkMiddleware()` to populate auth for route handlers (it never
  gates a route at the edge).

---

## 2. DATA FETCHING & MUTATIONS
- **Server-Side Fetching:** Fetch data directly inside async Server Components using native `fetch` or direct database calls.
- **No Client Fetching Cascades:** Never use `useEffect` for initial data loading. **One
  deliberate exception in this repo:** the client Zustand store
  ([src/lib/store.ts](src/lib/store.ts)) is not a data-fetching cascade — it is shared,
  optimistic, mutable client state (in-place mutations, a debounced whole-store `PUT`, and
  `409` reconciliation with MCP edits). Its initial data is fetched **on the server**
  ([src/features/goals/load.ts](src/features/goals/load.ts), awaited in the `(app)` layout)
  and the store is only *hydrated* from that `initialData` — no client round-trip. The
  client `load()` on mount survives solely as a fallback for a brand-new visitor with no
  session cookie (a Server Component can't mint one). Don't "fix" this into RSC fetching.
- **Parallel Fetching:** Prevent waterfalls by initializing multiple fetches in parallel using `Promise.all()` or initiate them concurrently.
- **Server Actions for Mutations:** Handle form submissions, state changes, and data mutations using Server Actions (`'use server'`).
- **Security in Actions:**
  - Never trust client inputs. Always validate input shapes using `Zod`.
  - Never pass user IDs or sensitive data from the client. Authenticate and retrieve the user session *inside* the Server Action.

---

## 3. FILE CONVENTIONS & ERROR HANDLING
- **Built-in Routing Files:** Leverage Next.js special files for route UI states:
  - `loading.tsx` (using Suspense skeletons) for perceived performance.
  - `error.tsx` (must be a client component) for route-segment error boundaries.
  - `not-found.tsx` for handling 404 errors.
- **Server-Only Isolation:** Protect server-side logic (DB queries, API secrets) by adding `import 'server-only'` at the very top of server utility files. This prevents accidental exposure in client bundles.

---

## 4. PERFORMANCE & OPTIMIZATION
- **Images:** Always use `next/image`. Provide explicit `width` and `height`, or use `fill`. Add the `priority` attribute for Above-the-Fold images (LCP elements).
- **Fonts & Links:** Use `next/font` for zero layout shift and `next/link` for automatic prefetching.
- **Code Splitting:** Lazy-load heavy client-side components using `next/dynamic`.
- **Caching Control:** Be explicit about route caching. Use `export const dynamic = 'force-dynamic'` or `revalidate` intervals only when static generation is not intended.

---

## 5. SEO & METADATA
- **Metadata API:** Never use raw `<head>` or `document.title` tags.
- **Static Metadata:** Export a static `metadata` object for predictable routes.
- **Dynamic Metadata:** Export an async `generateMetadata` function for routes relying on dynamic params:
  ```tsx
  export async function generateMetadata({ params }) {
    const { id } = await params;
    return { title: `Item ${id}` };
  }
  ```

---

## 6. CODE STYLE & ENVIRONMENT
- **TypeScript:** Enforce strict typing. Avoid `any`. Use TypeScript types for component props.
- **Environment Variables:** Private keys stay in `.env.local` (accessible only on server). Client-facing variables must strictly start with `NEXT_PUBLIC_`.
- **UI Components:** Use Tailwind CSS utility classes. When building complex UI components, prefer functional, accessible, and atomic structures.


## 7. FOLDER STRUCTURE & ARCHITECTURE

Follow the "Feature-Driven" and "Colocation" architecture patterns. Keep files closely related to their usage to limit context switching for both developers and AI.

### Root Directory Layout:
- `src/app/` — Routing Layer ONLY (Pages, Layouts, API routes, Server configuration).
- `src/components/` — Global Shared UI Components (atomic, reusable layout elements).
- `src/features/` — Domain/Business Logic Layer (Organized by feature modules).
- `src/lib/` — Third-party SDK initializations, shared utilities, and global configurations.
- `src/types/` — Global TypeScript definitions and shared schemas.

---

### Detailed Folder Guidelines:

#### A. The Routing Layer (`src/app/`)
- Treat folders in `src/app/` strictly as URLs/Routes.
- Keep `page.tsx` and `layout.tsx` files thin. Do not write extensive UI or business logic inside them. Instead, import a core view from the `features/` directory.
- Use **Route Groups** `(brackets)` to organize routes logically without affecting the URL path (e.g., `(auth)/login/page.tsx`, `(dashboard)/profile/page.tsx`).
- Use **Private Folders** `_folderName` for route-specific internal utilities that should be ignored by the Next.js router.

#### B. The Feature Layer (`src/features/`)
Group all related components, hooks, actions, and schemas by business domain.
Example structure for a feature named `billing`:
```text
src/features/billing/
├── components/       # UI components used only within this feature
├── hooks/            # Feature-specific React hooks (e.g., useSubscription)
├── actions.ts        # Server Actions strictly related to billing
├── schemas.ts        # Zod validation schemas for billing forms
├── types.ts          # Local TypeScript interfaces
└── index.ts          # Public API (clean exports for other features)
```
*Rule for AI:* Never cross-import internal files from another feature directly. Only import from the feature's `index.ts` (Public API).

#### C. Shared Components (`src/components/`)
- Store globally accessible, non-domain-specific UI elements here (e.g., standard buttons, inputs, modals, cards).
- Organize using atomic folders:
  - `src/components/ui/` — Low-level, unstyled, or primitive design system blocks (e.g., shadcn/ui components).
  - `src/components/layout/` — Global structural elements (e.g., `Header`, `Footer`, `Sidebar`).

#### D. Configuration & Utilities (`src/lib/`)
- Place structural, cross-cutting configurations here.
- Use dedicated files/folders for specific SDKs:
  - `src/lib/db.ts` — Prisma/Drizzle client singleton.
  - `src/lib/auth.ts` — Auth.js/NextAuth/Clerk configuration.
  - `src/lib/utils.ts` — Shared helper functions (e.g., Tailwind `clsx` / `twMerge` merger).

---

### File Colocation Rules for AI:
1. **Server Actions:** Keep route-specific server actions inside a local `actions.ts` file next to the page/feature using them, or inside `src/features/[feature_name]/actions.ts`.
2. **Styles:** Use Tailwind utility classes inline. Do not create global CSS files for individual components unless using CSS Modules, which must be colocated: `MyComponent.module.css` next to `MyComponent.tsx`.
3. **Tests:** Colocate test files directly next to the code they test using the `.test.ts` or `.spec.tsx` suffix.
