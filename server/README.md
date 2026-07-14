# The goals server

A small Node service that gives the goals a home outside the browser, so that an
assistant can read and change them. One process, one port, two surfaces:

| Surface | Path | Who talks to it |
| --- | --- | --- |
| REST | `/api/goals`, `/api/health` | The web app, if you point it at the server in **Settings** |
| MCP (Streamable HTTP) | `/mcp` | Claude, or any MCP client |

Both read and write the same Postgres database, which is the whole point: a
comment an agent leaves through MCP shows up in the app, and a comment you type
in the app is readable by the agent.

The web app itself is **not** part of this stack. It stays a static export, and
it works with no server at all — sync is opt-in.

## Run it

```bash
docker compose up -d --build      # from the repo root
curl localhost:8787/api/health    # {"ok":true,...}
```

Then open the app, click the gear in the top bar, and enter `http://localhost:8787`.

On first connect the server is empty, so the app pushes its goals up. From then
on the server is the shared copy: the app pulls from it on load and pushes edits
back (debounced). If both sides changed, the app is told and offers to pull —
last-write-wins, no CRDT.

## Connect an agent

[`.mcp.json`](../.mcp.json) in the repo root already points at it:

```json
{ "mcpServers": { "goals": { "type": "http", "url": "http://localhost:8787/mcp" } } }
```

Tools mirror the app's own vocabulary, so there's one mental model rather than
two: `list_goals`, `get_goal`, `create_goal`, `delete_goal`, `add_group`,
`rename_group`, `delete_group`, `add_step`, `toggle_step`, `delete_step`, and —
the reason this exists — `list_comments`, `add_comment`, `edit_comment`,
`delete_comment`. There's also a `goals://all` resource to pull the whole store
into context in one read.

## Develop

```bash
docker compose up -d db     # Postgres only
npm install
npm run dev                 # builds and runs, watching for changes
npm test                    # typecheck + tests, against the real database
```

Tests use a separate `goals_test` database (created when the Postgres volume is
first initialised) and truncate it between cases, so they never touch your real
goals. Override with `TEST_DATABASE_URL` if your Postgres lives elsewhere.

## Notes on the design

- **Schema.** Goals, groups, steps and comments are normalised tables with
  explicit `position` columns — the app treats these lists as ordered, so the
  order is stored rather than inferred from insert order. Deletes cascade.
- **Types are shared, not copied.** `src/lib/types.ts` from the web app compiles
  into this build ([src/domain.ts](src/domain.ts)). One definition of `Goal`.
- **Coarse REST, fine MCP.** The app owns the whole store client-side, so it
  pulls all of it and pushes all of it in one transaction. An agent edits one
  thing at a time, so MCP gets targeted operations. Concurrent writes are
  serialised by Postgres, and a stale push is rejected rather than allowed to
  clobber an agent's edit.
- **Stateless MCP.** A fresh server and transport per request — the state lives
  in Postgres, so there's no session worth keeping.
