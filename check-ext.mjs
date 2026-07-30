// Temporary, read-only probe of the production database.
// Delete after use: rm check-ext.mjs
import { Pool } from "pg";

// DATABASE_URL points at postgres.railway.internal, which only resolves inside
// Railway's private network. From a laptop we need the public TCP proxy.
const url = process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.log("No DATABASE_PUBLIC_URL / DATABASE_URL in env");
  process.exit(1);
}

const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
const q = async (sql) => (await pool.query(sql)).rows;

try {
  console.log("users:", (await q("select count(*)::int as n from users"))[0].n);
  console.log(
    "index:",
    await q(`select count(*)::int          as rows,
                    count(embedding)::int  as with_vector,
                    count(distinct owner_id)::int as owners
             from embeddings`)
  );
  console.log(
    "candidates:",
    await q(`select g.owner_id, count(*)::int as goals
             from goals g
             group by g.owner_id
             order by goals desc
             limit 3`)
  );
} finally {
  await pool.end();
}
