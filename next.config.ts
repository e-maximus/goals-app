import { readFileSync } from "node:fs";
import type { NextConfig } from "next";

// The app is a server — it owns /api/chat and /api/mcp, and the goals live in
// Postgres. That rules out the static export it used to ship as: route handlers
// cannot be exported. `standalone` emits a self-contained server, which is what
// the Dockerfile runs and Railway deploys.
//
// Gone along with the export: `basePath` (GitHub Pages served the app from a
// subdirectory) and `trailingSlash` (the export needed /goal/index.html to
// resolve as a path).

// The version shown in the footer, read here so the app doesn't import
// package.json (which would pull the whole manifest into a bundle) — see
// src/lib/version.ts.
const { version } = JSON.parse(readFileSync("./package.json", "utf8")) as { version: string };

const nextConfig: NextConfig = {
  output: "standalone",
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
  },
};

export default nextConfig;
