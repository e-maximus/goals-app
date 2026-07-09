// Prints the CHANGELOG.md notes for one version — used as GitHub Release body.
//
//   node scripts/changelog-section.mjs 0.2.0
//
// Extracts everything under "## [0.2.0] ..." up to the next "## [" heading,
// dropping link-reference definitions and surrounding blank lines. Falls back to
// a generic line if the version has no section.
import { readFileSync } from "node:fs";

const version = process.argv[2];
if (!version) {
  console.error("usage: changelog-section.mjs <version>");
  process.exit(1);
}

const lines = readFileSync("CHANGELOG.md", "utf8").split("\n");
const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const heading = new RegExp(`^## \\[${escaped}\\]`);

const start = lines.findIndex((l) => heading.test(l));
if (start === -1) {
  console.log(`Release v${version}`);
  process.exit(0);
}

let end = lines.findIndex((l, i) => i > start && /^## \[/.test(l));
if (end === -1) end = lines.length;

const body = lines
  .slice(start + 1, end)
  .filter((l) => !/^\[[^\]]+\]:/.test(l)) // drop [x]: url link definitions
  .join("\n")
  .trim();

console.log(body || `Release v${version}`);
