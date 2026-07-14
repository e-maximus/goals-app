// tsc only emits JavaScript, so the .sql migration files have to be carried
// into dist/ alongside it — db.ts reads them from disk at startup.
import { cp } from "node:fs/promises";

await cp("src/migrations", "dist/server/src/migrations", { recursive: true });
