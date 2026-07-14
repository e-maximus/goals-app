import { createApp } from "./app.js";
import { createPool, migrate } from "./db.js";

const port = Number(process.env.PORT ?? 8787);
const pool = createPool();

const applied = await migrate(pool);
if (applied.length) {
  console.log(`Applied migrations: ${applied.join(", ")}`);
}

const app = createApp({ pool, corsOrigin: process.env.CORS_ORIGIN });

const server = app.listen(port, () => {
  console.log(`goals-app server listening on :${port}`);
  console.log(`  REST  http://localhost:${port}/api/goals`);
  console.log(`  MCP   http://localhost:${port}/mcp`);
});

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    console.log(`${signal} received — shutting down`);
    server.close(() => {
      void pool.end().then(() => process.exit(0));
    });
  });
}
