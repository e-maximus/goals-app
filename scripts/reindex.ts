// Rebuild the search index for every user.
//
//   npm run reindex             # every user
//   npm run reindex -- --dry-run
//   npm run reindex -- <userId> # just one
//
// On Railway:  railway run npm run reindex
//
// Reindexing runs automatically after every write, so this is for the cases
// where no write is coming: the first backfill after the feature ships, and
// refilling vectors after EMBEDDING_MODEL changes. It is idempotent — a user
// whose index is already current costs one query and no embedding call.
import { createPool } from "../src/server/db";
import { reindexOwner } from "../src/server/embeddings/reindex";
import { embedder, embeddingModelName } from "../src/server/embeddings/model";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const only = args.find((a) => !a.startsWith("-"));

async function main() {
  const model = embeddingModelName();
  console.log(
    model
      ? `Embedding model: ${model}`
      : "No EMBEDDING_API_KEY — indexing text only, vectors will stay empty."
  );

  const pool = createPool();
  try {
    const { rows } = await pool.query<{ id: string }>(
      only ? "SELECT id FROM users WHERE id = $1" : "SELECT id FROM users ORDER BY created_at",
      only ? [only] : []
    );
    if (rows.length === 0) {
      console.log(only ? `No user ${only}.` : "No users.");
      return;
    }
    console.log(`${rows.length} user(s)${dryRun ? " — dry run, nothing will be written" : ""}`);
    if (dryRun) return;

    const embed = embedder();
    let chunks = 0;
    let embedded = 0;
    for (const { id } of rows) {
      // One user at a time: the point is a complete, correct index, not speed,
      // and serial keeps well clear of the provider's rate limits.
      const result = await reindexOwner(pool, id, embed);
      chunks += result.chunks;
      embedded += result.embedded;
      console.log(
        `  ${id}: ${result.chunks} chunks ` +
          `(+${result.inserted} ~${result.updated} -${result.deleted}), ` +
          `${result.embedded} embedded`
      );
    }
    console.log(`Done: ${chunks} chunks indexed, ${embedded} vectors written.`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
