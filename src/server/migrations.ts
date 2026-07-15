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
];
