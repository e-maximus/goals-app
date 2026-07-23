# Contributing

Short guide for opening a pull request in this repo. For the full working
guide (project shape, testing conventions, release automation) see
[AGENTS.md](AGENTS.md).

## Branches

- Branch off `main`; never commit directly to `main`.
- Name the branch after the change, in kebab-case — optionally with a type
  prefix: `feat/group-options-menu`, `fix/progress-badge-alignment`,
  `chore/remove-changelog`.

## Before you open a PR

- Add or update tests for any user-facing change (Playwright e2e in `e2e/`).
- Run the checks CI runs and make sure all three pass:
  ```bash
  npm run lint
  npm run build
  npm run test:e2e
  ```

## PR description

Every PR description **must** contain these three sections:

- **What & Why** — the problem and the chosen solution, in a short paragraph,
  before the diff.
- **Changes** — a map of the diff: what changed and where.
- **Tests** — what you added or updated, and confirmation that lint / build /
  e2e pass.

Add any of these **only when they carry weight** — skip the rest:

- Screenshots / Before–After (do include for UI changes)
- How to test (manual steps)
- Breaking changes / migration
- Related issues (`Closes #N`)
- Risks & trade-offs
- Out of scope / follow-ups

### Template

```markdown
## What & Why

<problem + solution>

## Changes

- <area>: <what changed>

## Tests

- <added/updated tests>
- lint / build / e2e: <result>
```

## Title & release label

- Write a clear, imperative title with no trailing period — it feeds the
  auto-generated release notes.
- Every merge ships at least a patch. Set a higher bump with a label when you
  open the PR:

  | Label           | Effect                  |
  | --------------- | ----------------------- |
  | _(none)_        | patch — the default     |
  | `release:minor` | new user-facing feature |
  | `release:major` | redesign / broken UX    |

CI (lint + build + e2e) must be green before merge. Merging into `main` cuts
the release automatically — you don't run any release command.
