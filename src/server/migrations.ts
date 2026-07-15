/**
 * Schema migrations, in order, as plain strings.
 *
 * They used to be `.sql` files read off disk at boot. That worked when the
 * server was its own Node process, but the server is now bundled into the Next
 * build — `import.meta.url` inside a bundled chunk points at `.next/server`,
 * not at a migrations directory, and the files would not be traced into the
 * standalone output either. Keeping the SQL in the module sidesteps both.
 *
 * `name` is the primary key in `schema_migrations`: never rename an applied
 * migration, and only ever append.
 */
export type Migration = { name: string; sql: string };

export const migrations: Migration[] = [
  {
    name: "001_init",
    sql: `
      -- Goals, their groups of steps, and the comment feed hanging off each goal.
      --
      -- \`position\` preserves the order the user arranged things in; the app treats
      -- lists as ordered, so we store that explicitly rather than relying on insert
      -- order. \`created_at\` is epoch milliseconds, matching Goal.createdAt in the app.

      CREATE TABLE IF NOT EXISTS goals (
        id         TEXT    PRIMARY KEY,
        title      TEXT    NOT NULL,
        why        TEXT,
        created_at BIGINT  NOT NULL,
        position   INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS groups (
        id       TEXT    PRIMARY KEY,
        goal_id  TEXT    NOT NULL REFERENCES goals (id) ON DELETE CASCADE,
        title    TEXT    NOT NULL,
        position INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS steps (
        id       TEXT    PRIMARY KEY,
        group_id TEXT    NOT NULL REFERENCES groups (id) ON DELETE CASCADE,
        text     TEXT    NOT NULL,
        done     BOOLEAN NOT NULL DEFAULT FALSE,
        position INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS comments (
        id         TEXT   PRIMARY KEY,
        goal_id    TEXT   NOT NULL REFERENCES goals (id) ON DELETE CASCADE,
        text       TEXT   NOT NULL,
        created_at BIGINT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS groups_goal_id_idx   ON groups (goal_id);
      CREATE INDEX IF NOT EXISTS steps_group_id_idx   ON steps (group_id);
      CREATE INDEX IF NOT EXISTS comments_goal_id_idx ON comments (goal_id);

      -- A single row holding the last-write timestamp. The web app compares it
      -- against its own to detect a conflicting concurrent write, and its absence is
      -- how we know the store has never been written to (see \`initialized\`).
      CREATE TABLE IF NOT EXISTS meta (
        only_row   BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (only_row),
        updated_at BIGINT  NOT NULL
      );
    `,
  },
  {
    name: "002_per_user_accounts",
    sql: `
      -- Goals become per-user. A user is identified by two opaque tokens:
      -- \`session_token\` rides in an httpOnly cookie for the web app, and \`pat\`
      -- is a personal access token the user pastes into an MCP client. Neither is
      -- the identity — \`id\` is — so either can be rotated without losing goals.
      --
      -- \`goals_updated_at\` is the per-user last-write stamp the old single-row
      -- \`meta\` table used to hold globally; the web app compares it against its
      -- own to detect a write that raced it (see repo.replaceAll).

      CREATE TABLE IF NOT EXISTS users (
        id               TEXT   PRIMARY KEY,
        session_token    TEXT   NOT NULL UNIQUE,
        pat              TEXT   NOT NULL UNIQUE,
        goals_updated_at BIGINT,
        created_at       BIGINT NOT NULL
      );

      -- Goals predating this migration were global and ownerless. Ownership is
      -- required now and there is no user to attribute them to, so drop them
      -- (CASCADE clears groups, steps and comments with them). New users are
      -- seeded their own copy of the example goals on first visit.
      TRUNCATE goals CASCADE;

      -- The conflict stamp is per-user now, on users.goals_updated_at.
      DROP TABLE IF EXISTS meta;

      ALTER TABLE goals
        ADD COLUMN owner_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE;

      CREATE INDEX IF NOT EXISTS goals_owner_id_idx ON goals (owner_id);
    `,
  },
  {
    name: "003_step_description",
    sql: `
      -- A step gains an optional longer note beneath its title. \`text\` stays the
      -- title; \`description\` is nullable because existing steps have none and it
      -- is optional going forward (see Step.description in src/lib/types.ts).
      ALTER TABLE steps ADD COLUMN description TEXT;
    `,
  },
  {
    name: "004_rename_comments_to_notes",
    sql: `
      -- "Comments" were renamed to "Notes" across the app. The table's columns
      -- are unchanged (id, goal_id, text, created_at) — only the table and its
      -- index carry the old name, so this is a pure rename with no data movement.
      ALTER TABLE comments RENAME TO notes;
      ALTER INDEX comments_goal_id_idx RENAME TO notes_goal_id_idx;
    `,
  },
  {
    name: "005_note_step_link",
    sql: `
      -- A note may optionally point at one step ("sub-goal") within its goal.
      -- Nullable because most notes are about the goal as a whole. ON DELETE SET
      -- NULL so deleting the step just unlinks the note rather than removing it.
      ALTER TABLE notes ADD COLUMN step_id TEXT REFERENCES steps (id) ON DELETE SET NULL;
      CREATE INDEX IF NOT EXISTS notes_step_id_idx ON notes (step_id);
    `,
  },
];
