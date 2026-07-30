// Temporary probe: embedding + database wiring for this service.
// Prints presence and hostnames only, never credentials.
// Delete after use: rm check-embed.mjs
const key = process.env.EMBEDDING_API_KEY;
console.log("EMBEDDING_API_KEY:", key ? `set (${key.length} chars)` : "NOT SET");
console.log("EMBEDDING_MODEL:", process.env.EMBEDDING_MODEL ?? "(unset → text-embedding-3-small)");
console.log("EMBEDDING_DIMENSIONS:", process.env.EMBEDDING_DIMENSIONS ?? "(unset → 768)");

for (const name of Object.keys(process.env).filter((k) => /DATABASE|POSTGRES|PG/.test(k)).sort()) {
  const raw = process.env[name];
  let where = "(not a url)";
  try {
    where = new URL(raw).host;
  } catch {}
  console.log(`${name}: ${where}`);
}
