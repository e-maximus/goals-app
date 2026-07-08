# Goals

Break big things into steps. **Goals** is a small web app for decomposing a
goal into groups of concrete steps, then tracking progress one checkbox at a
time.

**Live demo:** https://e-maximus.github.io/goals-app/

[![Goals app — dashboard](docs/my-goals.png)](https://e-maximus.github.io/goals-app/)

## What it does

- Create a goal with an optional "why" to remember your motivation.
- Break each goal into **groups**, and each group into checkable **steps**.
- Watch progress roll up automatically — per group and per goal — with progress
  bars and status labels (Just started / Active / Done).
- Everything is saved locally in your browser (`localStorage`); a seeded example
  goal shows up on your first visit.

No account, no backend — open the page and start.

## Tech stack

- **[Next.js 16](https://nextjs.org)** (App Router) + **React 19**
- **TypeScript**
- **Tailwind CSS v4** with **shadcn/ui** components (built on
  **[Base UI](https://base-ui.com)**)
- **lucide-react** icons, **next-themes** for light/dark, **sonner** for toasts
- Static export deployed to **GitHub Pages** via **GitHub Actions**

## Architecture

The app is a fully client-side single-page experience exported as a static site.

```
src/
  app/            # Next.js App Router
    layout.tsx    # root layout, fonts, StoreProvider, Toaster
    page.tsx      # dashboard route (goal list)
    goal/page.tsx # single-goal detail route (?id=…)
  components/     # UI: dashboard, goal-detail, group-card, dialogs, topbar
    ui/           # shadcn/Base UI primitives (button, card, dialog, …)
  lib/
    types.ts      # Goal / Group / Step types + progress helpers
    store.tsx     # StoreProvider — state + localStorage persistence
    seed.ts       # example data for first visit
    utils.ts      # cn() and helpers
```

- **State** lives in a single React context (`StoreProvider` in
  [src/lib/store.tsx](src/lib/store.tsx)). It exposes CRUD actions for goals,
  groups, and steps, and persists to `localStorage` under the `goals-app:v1`
  key.
- **Derived progress** (percentages, counts, completion) is computed by pure
  helpers in [src/lib/types.ts](src/lib/types.ts) rather than stored.
- **Routing** is two routes — a dashboard and a `?id=`-driven goal detail —
  kept static-export friendly (`trailingSlash`, unoptimized images).

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Build & deploy

The build is driven by [scripts/build.mjs](scripts/build.mjs) and defaults to a
static export into `./out`:

```bash
npm run build                         # static export (GitHub Pages) → ./out
npm run build -- --output server      # regular server build (npm start)
npm run build -- --output standalone  # self-contained server (Docker)
```

For a GitHub Pages **project** site (`user.github.io/<repo>`), set the base path
at build time:

```bash
NEXT_PUBLIC_BASE_PATH="/goals-app" npm run build
```

Pushing to `main` triggers the
[Deploy to GitHub Pages](.github/workflows/deploy.yml) workflow, which builds the
static export (computing the base path automatically) and publishes it.
