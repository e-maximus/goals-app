import { createHash } from "node:crypto";
import { Embeddings } from "@langchain/core/embeddings";
import { createPool, migrate, type Pool } from "../db";
import { EMBEDDING_DIMENSIONS, type Embedder } from "../embeddings/model";

/**
 * These tests run against a real Postgres rather than a fake — the whole point
 * of the repo layer is its SQL and its transactions, and a fake would only
 * assert that the mock was called.
 *
 *   docker compose up -d db     # locally
 *
 * CI provides the same thing as a service container.
 *
 * The suites share one database and truncate it between tests, so the files
 * must run one at a time — see `--test-concurrency=1` in the test script.
 */
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://goals:goals@localhost:5432/goals_test";

export async function setupPool(): Promise<Pool> {
  const pool = createPool(TEST_DATABASE_URL);
  await migrate(pool);
  return pool;
}

/** Wipe every table between tests. Cascades take care of the child rows. */
export async function reset(pool: Pool): Promise<void> {
  await pool.query("TRUNCATE users, goals RESTART IDENTITY CASCADE");
}

/**
 * Insert a bare user (no seeded goals, `goals_updated_at` null so its store
 * reads as uninitialized) and return its id. Goals are per-user now, so a repo
 * test needs an owner to hang its goals off. Pass distinct ids to test isolation
 * between two users.
 */
export async function createOwner(pool: Pool, id = "owner-1"): Promise<string> {
  await pool.query(
    "INSERT INTO users (id, session_token, created_at) VALUES ($1, $2, $3)",
    [id, `${id}-session`, Date.now()]
  );
  return id;
}

/**
 * A deterministic stand-in for an embedding provider.
 *
 * Embedding over the network in CI would be slow, flaky, and would make a paid
 * key a prerequisite for running the suite. The vector is derived from a hash of
 * the text, so it is stable across runs but says nothing about meaning — tests
 * that care about *ranking* want the lexical embedder in
 * [search-cases.ts](./search-cases.ts) instead.
 *
 * It extends `Embeddings` rather than faking the shape, so the production path —
 * the vector store, the retriever — runs unmodified against it. Every batch it
 * is handed is recorded, which is how the reindex tests assert what was sent.
 */
export class FakeEmbeddings extends Embeddings {
  /** Every batch of texts sent to `embedDocuments`, in order. */
  readonly batches: string[][] = [];

  constructor() {
    super({});
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    this.batches.push(texts);
    return texts.map((text) => this.vectorize(text));
  }

  async embedQuery(text: string): Promise<number[]> {
    return this.vectorize(text);
  }

  private vectorize(text: string): number[] {
    const seed = createHash("sha256").update(text).digest();
    return Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => seed[i % seed.length]! / 255);
  }
}

/** A {@link FakeEmbeddings} paired with a model name, ready for the index. */
export function fakeEmbedder(modelName = "fake-model"): Embedder & {
  embeddings: FakeEmbeddings;
} {
  return { modelName, embeddings: new FakeEmbeddings() };
}
