// Thin wrapper around `next build` that lets you pick the output mode from the
// CLI: `npm run build -- --output <mode>`. Without the flag, next.config.ts
// falls back to its default. Recognised modes: export | standalone | server.
import { spawnSync } from "node:child_process";

const VALID = ["export", "standalone", "server"];
const args = process.argv.slice(2);

let output;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--output") output = args[++i];
  else if (a.startsWith("--output=")) output = a.slice("--output=".length);
}

if (output && !VALID.includes(output)) {
  console.error(`Invalid --output "${output}". Use one of: ${VALID.join(", ")}`);
  process.exit(1);
}

const env = { ...process.env };
if (output) env.NEXT_OUTPUT = output; // read by next.config.ts

const res = spawnSync("next", ["build"], { stdio: "inherit", env });
process.exit(res.status ?? 1);
