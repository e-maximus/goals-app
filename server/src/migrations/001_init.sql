-- Goals, their groups of steps, and the comment feed hanging off each goal.
--
-- `position` preserves the order the user arranged things in; the app treats
-- lists as ordered, so we store that explicitly rather than relying on insert
-- order. `created_at` is epoch milliseconds, matching Goal.createdAt in the app.

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
-- how we know the store has never been written to (see `initialized`).
CREATE TABLE IF NOT EXISTS meta (
  only_row   BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (only_row),
  updated_at BIGINT  NOT NULL
);
