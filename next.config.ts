import type { NextConfig } from "next";

// For a GitHub Pages *project* site (username.github.io/<repo>) set
// NEXT_PUBLIC_BASE_PATH="/<repo>" at build time. Leave empty for a user site
// (username.github.io) or for local `next dev`.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

// Output mode. Overridable via `npm run build -- --output <mode>` (which sets
// NEXT_OUTPUT through scripts/build.mjs); defaults to a static export.
//   export     → static site in ./out (GitHub Pages)   [default]
//   standalone → self-contained server in .next/standalone (Docker)
//   server     → regular server build in .next (`npm start`)
function resolveOutput(): NextConfig["output"] {
  switch (process.env.NEXT_OUTPUT) {
    case "server":
      return undefined; // no `output` key = default server build
    case "standalone":
      return "standalone";
    case "export":
    case undefined:
    case "":
      return "export"; // config default
    default:
      throw new Error(`Unknown NEXT_OUTPUT "${process.env.NEXT_OUTPUT}"`);
  }
}

const nextConfig: NextConfig = {
  output: resolveOutput(),
  basePath,
  images: { unoptimized: true }, // static export has no image optimizer server
  trailingSlash: true, // emit /goal/index.html so paths resolve on GitHub Pages
};

export default nextConfig;
