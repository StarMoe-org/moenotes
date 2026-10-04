// Prepares a release: sets the package.json version, regenerates CHANGELOG.md with git-cliff, then commits
// `chore(release): vX.Y.Z` and creates the annotated tag. Pushing is left to the caller.
//
//   bun run release           # next version from the commits since the last tag (see [bump] in cliff.toml)
//   bun run release 0.3.0     # explicit version
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const run = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8" }).trim();

if (run("git", ["status", "--porcelain"])) {
  console.error("release: the working tree has uncommitted changes");
  process.exit(1);
}

const version = (process.argv[2] ?? run("git-cliff", ["--bumped-version"])).replace(/^v/, "");
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error(`release: "${version}" is not a semantic version`);
  process.exit(1);
}
const tag = `v${version}`;
if (run("git", ["tag", "--list", tag])) {
  console.error(`release: tag ${tag} already exists`);
  process.exit(1);
}

const pkgPath = "package.json";
const pkg = readFileSync(pkgPath, "utf8");
writeFileSync(pkgPath, pkg.replace(/^(\s*"version":\s*)"[^"]*"/m, `$1"${version}"`));

run("git-cliff", ["--tag", tag, "--output", "CHANGELOG.md"]);
run("git", ["add", pkgPath, "CHANGELOG.md"]);
run("git", ["commit", "--message", `chore(release): ${tag}`]);
run("git", ["tag", "--annotate", tag, "--message", tag]);

console.log(`Created ${tag}. Publish it with: git push origin HEAD ${tag}`);
