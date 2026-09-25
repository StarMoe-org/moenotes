// Vendors the moenotes-chart-renderer WASM SDK into src/vendor/moenotes-chart-renderer.
//
// The SDK targets wasm32-unknown-emscripten and its build tooling needs a Unix host, so by default the
// SDK is taken from the upstream CI job that builds it (artifact "moenotes-chart-renderer-wasm").
//
//   node scripts/sync-chart-renderer.mjs                      latest successful CI run on main
//   node scripts/sync-chart-renderer.mjs --run <id>           a specific CI run
//   node scripts/sync-chart-renderer.mjs --from <dist/wasm> --commit <sha>
//                                                             a local `scripts/build_wasm.py` output
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = resolve(root, "src/vendor/moenotes-chart-renderer");
const SOURCE_REPOSITORY = "StarMoe-org/moenotes-chart-renderer";
// The WASM job runs on the upstream development repository; StarMoe-org mirrors the same commits.
const CI_REPOSITORY = "luoxiadesu/moenotes-chart-renderer";
const CI_WORKFLOW = "build-and-test";
const ARTIFACT = "moenotes-chart-renderer-wasm";
// Runtime files plus the notices that must travel with the fonts, Skia and Emscripten inside the module.
const FILES = ["moenotes-wasm.mjs", "moenotes-wasm.wasm", "renderer.mjs", "renderer.d.ts", "manifest.json", "LICENSE", "THIRD_PARTY.md"];
const DIRECTORIES = ["licenses", "font-notices"];

function option(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }).trim();
}

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function downloadFromCi(runOption) {
  const [run] = runOption
    ? [JSON.parse(gh(["run", "view", runOption, "-R", CI_REPOSITORY, "--json", "databaseId,headSha,conclusion"]))]
    : JSON.parse(gh(["run", "list", "-R", CI_REPOSITORY, "--workflow", CI_WORKFLOW, "--branch", "main", "--status", "success", "-L", "1", "--json", "databaseId,headSha,conclusion"]));
  if (!run) throw new Error(`No successful ${CI_WORKFLOW} run found on ${CI_REPOSITORY}`);
  if (run.conclusion !== "success") throw new Error(`Run ${run.databaseId} concluded "${run.conclusion}", expected success`);
  const directory = mkdtempSync(join(tmpdir(), "moenotes-chart-renderer-"));
  gh(["run", "download", String(run.databaseId), "-R", CI_REPOSITORY, "-n", ARTIFACT, "-D", directory]);
  return { directory, commit: run.headSha, build: { repository: CI_REPOSITORY, run: run.databaseId, artifact: ARTIFACT } };
}

function verify(directory) {
  const manifest = JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8"));
  for (const [file, expected] of Object.entries(manifest.sha256)) {
    const actual = sha256(join(directory, file));
    if (actual !== expected) throw new Error(`SHA-256 mismatch for ${file}: ${actual} != ${expected}`);
  }
  for (const file of FILES) {
    if (!existsSync(join(directory, file))) throw new Error(`SDK is missing ${file}`);
  }
  return manifest;
}

const from = option("from");
const source = from
  ? { directory: resolve(from), commit: option("commit") ?? "unknown", build: { local: true } }
  : downloadFromCi(option("run"));
const manifest = verify(source.directory);

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
for (const file of FILES) cpSync(join(source.directory, file), join(target, file));
// TypeScript types a `renderer.mjs` import from `renderer.d.mts`; the SDK ships the same declarations as `.d.ts`.
cpSync(join(source.directory, "renderer.d.ts"), join(target, "renderer.d.mts"));
for (const directory of DIRECTORIES) {
  if (existsSync(join(source.directory, directory))) cpSync(join(source.directory, directory), join(target, directory), { recursive: true });
}
writeFileSync(join(target, "SOURCE.json"), `${JSON.stringify({
  repository: SOURCE_REPOSITORY,
  commit: source.commit,
  toolchain: manifest.toolchain,
  build: source.build,
  wasmSha256: manifest.sha256["moenotes-wasm.wasm"],
}, null, 2)}\n`);
if (!from) rmSync(source.directory, { recursive: true, force: true });

console.log(`[moenotes] chart renderer ${source.commit.slice(0, 12)} -> ${target}`);
