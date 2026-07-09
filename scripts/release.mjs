// One-command release helper.
//
//   npm run release            # patch bump (0.1.0 -> 0.1.1)
//   npm run release minor      # 0.1.x -> 0.2.0
//   npm run release major      # 0.x   -> 1.0.0
//   npm run release 1.4.0      # explicit version
//   npm run release -- minor --push    # also push commit + tag
//   npm run release -- minor --dry-run # print what would change, touch nothing
//
// Note: pass flags after `--` so npm forwards them to this script rather than
// consuming them itself.
//
// What it does:
//   1. Verifies a clean working tree on a sensible branch.
//   2. Moves the "## [Unreleased]" notes into a new "## [x.y.z] - DATE" section
//      and refreshes the compare links at the bottom of CHANGELOG.md.
//   3. Bumps package.json + package-lock.json (npm version --no-git-tag-version).
//   4. Commits everything as one "release: vX.Y.Z" commit and tags vX.Y.Z.
//   5. With --push, pushes the branch and the tag (which triggers the Release
//      workflow that publishes the GitHub Release).
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const CHANGELOG = "CHANGELOG.md";
const rawArgs = process.argv.slice(2);

// Pull out `--note <text>` / `--note=<text>` first so its value isn't mistaken
// for the bump argument. Used by CI to seed the changelog from a PR title when
// nobody wrote an [Unreleased] entry.
let note;
const args = [];
for (let i = 0; i < rawArgs.length; i++) {
  const a = rawArgs[i];
  if (a === "--note") note = rawArgs[++i];
  else if (a.startsWith("--note=")) note = a.slice("--note=".length);
  else args.push(a);
}

const flags = new Set(args.filter((a) => a.startsWith("--")));
const positional = args.filter((a) => !a.startsWith("--"));
const dryRun = flags.has("--dry-run");
const push = flags.has("--push");
const allowEmpty = flags.has("--allow-empty");

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

function sh(cmd, cmdArgs, opts = {}) {
  const res = spawnSync(cmd, cmdArgs, { encoding: "utf8", ...opts });
  if (res.status !== 0 && !opts.allowFailure) {
    fail(`\`${cmd} ${cmdArgs.join(" ")}\` failed:\n${res.stderr || res.stdout}`);
  }
  return (res.stdout || "").trim();
}

// --- 1. sanity checks --------------------------------------------------------

if (!dryRun && sh("git", ["status", "--porcelain"])) {
  fail("Working tree is not clean — commit or stash first.");
}

const branch = sh("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
if (branch !== "main" && !flags.has("--force-branch")) {
  fail(`On branch "${branch}", not "main". Use --force-branch to override.`);
}

// --- 2. figure out the new version ------------------------------------------

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const current = pkg.version;
const [maj, min, pat] = current.split(".").map(Number);

const bump = positional[0] ?? "patch";
let next;
if (bump === "patch") next = `${maj}.${min}.${pat + 1}`;
else if (bump === "minor") next = `${maj}.${min + 1}.0`;
else if (bump === "major") next = `${maj + 1}.0.0`;
else if (/^\d+\.\d+\.\d+$/.test(bump)) next = bump;
else fail(`Unknown bump "${bump}". Use patch | minor | major | x.y.z`);

console.log(`Releasing ${current} → ${next}`);

// --- 3. rewrite the changelog ------------------------------------------------

const repo = repoBaseUrl();
const today = new Date().toISOString().slice(0, 10);
const original = readFileSync(CHANGELOG, "utf8");
const updated = rewriteChangelog(original, next, today, current, repo);

if (dryRun) {
  console.log("\n--- CHANGELOG.md (dry run) ---\n");
  console.log(updated);
  console.log(`\n(dry run) would bump to ${next}, commit, and tag v${next}`);
  process.exit(0);
}

writeFileSync(CHANGELOG, updated);

// --- 4. bump version files, commit, tag -------------------------------------

sh("npm", ["version", next, "--no-git-tag-version"]);
sh("git", ["add", CHANGELOG, "package.json", "package-lock.json"]);
sh("git", ["commit", "-m", `release: v${next}`]);
// Annotated tag so `git push --follow-tags` will push it.
sh("git", ["tag", "-a", `v${next}`, "-m", `Release v${next}`]);
console.log(`✓ Committed and tagged v${next}`);

// --- 5. optionally push ------------------------------------------------------

if (push) {
  sh("git", ["push", "--follow-tags"], { stdio: "inherit" });
  console.log("✓ Pushed — the Release workflow will publish the GitHub Release.");
} else {
  console.log(`\nNext: git push --follow-tags   (or re-run with --push)`);
}

// --- helpers -----------------------------------------------------------------

function repoBaseUrl() {
  const url = sh("git", ["config", "--get", "remote.origin.url"], {
    allowFailure: true,
  });
  const m = url.match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/);
  return m ? `https://github.com/${m[1]}/${m[2]}` : null;
}

function rewriteChangelog(text, version, date, prev, repo) {
  const lines = text.split("\n");

  const unrelIdx = lines.findIndex((l) => /^## \[Unreleased\]/i.test(l));
  if (unrelIdx === -1) fail(`No "## [Unreleased]" heading in ${CHANGELOG}.`);

  // Body of [Unreleased] = everything until the next "## [" heading.
  let nextHeadingIdx = lines.findIndex(
    (l, i) => i > unrelIdx && /^## \[/.test(l),
  );
  if (nextHeadingIdx === -1) nextHeadingIdx = lines.length;

  let body = lines
    .slice(unrelIdx + 1, nextHeadingIdx)
    .join("\n")
    .trim();

  // If nobody wrote an [Unreleased] entry, fall back to the provided note
  // (e.g. the merged PR title in CI) so releases always get a changelog line.
  if (!body && note) body = `### Changed\n\n- ${note}`;

  if (!body && !allowEmpty) {
    fail(
      `Nothing under "## [Unreleased]" to release. ` +
        `Add notes there first, pass --note "...", or pass --allow-empty.`,
    );
  }

  const newSection = [
    "## [Unreleased]",
    "",
    `## [${version}] - ${date}`,
    "",
    body,
    "",
  ].join("\n");

  const rebuilt = [
    ...lines.slice(0, unrelIdx),
    ...newSection.split("\n"),
    ...lines.slice(nextHeadingIdx),
  ];

  return updateCompareLinks(rebuilt.join("\n"), version, prev, repo);
}

function updateCompareLinks(text, version, prev, repo) {
  if (!repo) return text; // no remote → skip link maintenance
  const lines = text.split("\n");

  const unrelLink = `[Unreleased]: ${repo}/compare/v${version}...HEAD`;
  // Link the previous tag to the new one; if the prev tag was never created,
  // just point at the new release page so the link doesn't 404.
  const prevTagExists = sh("git", ["tag", "-l", `v${prev}`], {
    allowFailure: true,
  });
  const versionLink = prevTagExists
    ? `[${version}]: ${repo}/compare/v${prev}...v${version}`
    : `[${version}]: ${repo}/releases/tag/v${version}`;

  const idx = lines.findIndex((l) => /^\[Unreleased\]:/i.test(l));
  if (idx === -1) {
    // No link section yet — append one.
    return `${text.trimEnd()}\n\n${unrelLink}\n${versionLink}\n`;
  }
  lines[idx] = unrelLink;
  lines.splice(idx + 1, 0, versionLink);
  return lines.join("\n");
}
