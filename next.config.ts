import type { NextConfig } from "next";

// The app is a server now — it owns /api/goals and /api/mcp, and the goals live
// in Postgres. That rules out the static export it used to ship as: route
// handlers cannot be exported. `standalone` emits a self-contained server, which
// is what the Dockerfile runs and Railway deploys.
//
// Gone along with the export: `basePath` (GitHub Pages served the app from a
// subdirectory) and `trailingSlash` (the export needed /goal/index.html to
// resolve as a path).
const nextConfig: NextConfig = {
  output: "standalone",
};

export default nextConfig;
