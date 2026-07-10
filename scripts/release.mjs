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
//   2. Bumps package.json + package-lock.json (npm version --no-git-tag-version).
//   3. Commits as one "release: vX.Y.Z" commit and tags vX.Y.Z.
//   4. With --push, pushes the branch and the tag (which triggers the Release
//      workflow that publishes the GitHub Release).
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const positional = args.filter((a) => !a.startsWith("--"));
const dryRun = flags.has("--dry-run");
const push = flags.has("--push");

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

if (dryRun) {
  console.log(`\n(dry run) would bump to ${next}, commit, and tag v${next}`);
  process.exit(0);
}

// --- 3. bump version files, commit, tag -------------------------------------

sh("npm", ["version", next, "--no-git-tag-version"]);
sh("git", ["add", "package.json", "package-lock.json"]);
sh("git", ["commit", "-m", `release: v${next}`]);
// Annotated tag so `git push --follow-tags` will push it.
sh("git", ["tag", "-a", `v${next}`, "-m", `Release v${next}`]);
console.log(`✓ Committed and tagged v${next}`);

// --- 4. optionally push ------------------------------------------------------

if (push) {
  sh("git", ["push", "--follow-tags"], { stdio: "inherit" });
  console.log("✓ Pushed — the Release workflow will publish the GitHub Release.");
} else {
  console.log(`\nNext: git push --follow-tags   (or re-run with --push)`);
}
