// Reports how far the pinned Haneoka engine is from upstream and whether `patches/haneoka-rewards.patch`
// still applies to the upstream head. Running it needs git and network access, not Rust:
//
//   node scripts/check-haneoka-upstream.mjs            pinned commit vs upstream `main`
//   node scripts/check-haneoka-upstream.mjs --ref X    compare with another upstream commit
//   node scripts/check-haneoka-upstream.mjs --patch    also apply the reward patch to the upstream head
//
// A clean patch is only the first condition for moving `HANEOKA_COMMIT`: the reward layer must still be reviewed
// against the upstream changes, and the WASM must be rebuilt and tested with `bun run build:haneoka-engine --test`
// on a machine with Rust (`wasm32-unknown-unknown`). Exit code 1 means the pin cannot move as it stands.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const UPSTREAM_REPO = "https://github.com/haneoka-gakuen/ournotes-team-builder.git";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function option(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

const { HANEOKA_COMMIT: pinned, HANEOKA_PATCH_SHA: patchSha256 } = await import("../src/lib/deck/haneoka/request.ts");
const ref = option("ref") ?? "main";
const checkPatch = process.argv.includes("--patch");

const work = mkdtempSync(join(tmpdir(), "moenotes-haneoka-"));
let status = 0;
try {
  git(work, ["init", "-q"]);
  git(work, ["remote", "add", "origin", UPSTREAM_REPO]);
  git(work, ["fetch", "-q", "origin", ref]);
  const head = git(work, ["rev-parse", "FETCH_HEAD"]);
  try {
    git(work, ["cat-file", "-e", `${pinned}^{commit}`]);
  } catch {
    git(work, ["fetch", "-q", "origin", pinned]);
  }
  const ahead = Number(git(work, ["rev-list", "--count", `${pinned}..${head}`]));
  const behind = Number(git(work, ["rev-list", "--count", `${head}..${pinned}`]));
  console.log(`pinned   ${pinned}`);
  console.log(`upstream ${head} (${ref})`);
  console.log(`commits  ${ahead} ahead, ${behind} behind`);
  console.log(`patch    ${patchSha256}`);

  if (ahead > 0) {
    const subjects = git(work, ["log", "--format=%h %s", `${pinned}..${head}`]).split("\n").filter(Boolean);
    console.log(`\n${subjects.length} upstream commit(s) since the pin:`);
    for (const subject of subjects) console.log(`  ${subject}`);
  }

  if (checkPatch && ahead > 0) {
    git(work, ["checkout", "-q", "--detach", head]);
    try {
      git(work, ["apply", "--check", join(root, "patches/haneoka-rewards.patch")]);
      console.log("\nreward patch: applies cleanly to the upstream head");
      console.log("next: review the reward layer against the upstream changes, then rebuild and test the WASM");
    } catch (error) {
      status = 1;
      const output = [error?.stdout, error?.stderr].filter(Boolean).join("\n").trim();
      console.log("\nreward patch: does NOT apply to the upstream head");
      for (const line of output.split("\n").filter(Boolean)) console.log(`  ${line}`);
      console.log("next: port the reward layer onto the upstream head, then rebuild with `bun run build:haneoka-engine --test`");
    }
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
process.exit(status);
