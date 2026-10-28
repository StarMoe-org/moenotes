import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, copyFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HANEOKA_COMMIT as commit, HANEOKA_PATCH_SHA as patchSha256 } from "../src/lib/deck/haneoka/request.ts";

const UPSTREAM_REPO = "https://github.com/haneoka-gakuen/ournotes-team-builder.git";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
let customOut = null;
let runTests = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--out") {
    if (!args[i + 1]) throw new Error("--out requires a directory path");
    customOut = path.resolve(root, args[++i]);
  } else if (args[i] === "--test") {
    runTests = true;
  } else {
    throw new Error(`Unknown build-haneoka-engine option: ${args[i]}`);
  }
}

const output = customOut ?? path.join(root, "public/haneoka-team-engine");
const patch = path.join(root, "patches/haneoka-rewards.patch");
if (createHash("sha256").update(readFileSync(patch)).digest("hex") !== patchSha256) {
  throw new Error("Haneoka patch hash differs from the adapter's model identity");
}

const run = (command, cmdArgs, cwd = root) => {
  try {
    execFileSync(command, cmdArgs, { cwd, encoding: "utf8" });
  } catch (error) {
    const details = [error?.stdout, error?.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`Command failed: ${command} ${cmdArgs.join(" ")}${details ? "\n" + details : ""}`);
  }
};

const cacheKey = `${commit.slice(0, 12)}-${patchSha256.slice(0, 12)}`;
const cacheRoot = process.env.MOENOTES_HANEOKA_CACHE_DIR
  ? path.resolve(root, process.env.MOENOTES_HANEOKA_CACHE_DIR)
  : path.join(root, ".haneoka/wasm-cache");
const wasmCacheDir = path.join(cacheRoot, cacheKey);
const cachedAssets = ["team-engine.wasm", "LICENSE", "NOTICE"];
const hasCachedWasm = !runTests && cachedAssets.every((name) => existsSync(path.join(wasmCacheDir, name)));

if (!hasCachedWasm) {
  const source = path.join(root, ".haneoka/engine");
  if (!existsSync(path.join(source, ".git"))) {
    mkdirSync(source, { recursive: true });
    run("git", ["init", "-q"], source);
    run("git", ["remote", "add", "origin", UPSTREAM_REPO], source);
    run("git", ["fetch", "--depth", "1", "origin", commit], source);
    run("git", ["checkout", "-q", "--detach", "FETCH_HEAD"], source);
  } else {
    const current = execFileSync("git", ["rev-parse", "HEAD"], { cwd: source, encoding: "utf8" }).trim();
    if (execFileSync("git", ["status", "--porcelain"], { cwd: source, encoding: "utf8" }).trim()) {
      throw new Error("Haneoka engine cache has local changes: " + source);
    }
    if (current !== commit) {
      run("git", ["fetch", "--depth", "1", "origin", commit], source);
      run("git", ["checkout", "-q", "--detach", "FETCH_HEAD"], source);
    }
  }

  const patchedRelative = `.haneoka/patched-${cacheKey}`;
  const patched = path.join(root, patchedRelative);
  const files = execFileSync("git", ["ls-files", "-z"], { cwd: source, encoding: "utf8" }).split("\0").filter(Boolean);
  const digest = (filePath) => createHash("sha256").update(readFileSync(filePath)).digest("hex");
  const prepared = path.join(patched, ".source-hashes.json");
  if (existsSync(prepared)) {
    const hashes = JSON.parse(readFileSync(prepared, "utf8"));
    if (
      Object.keys(hashes).length !== files.length ||
      files.some((name) => !existsSync(path.join(patched, name)) || digest(path.join(patched, name)) !== hashes[name])
    ) {
      throw new Error("Generated Haneoka source has local changes: " + patched);
    }
  } else {
    for (const name of files) {
      const target = path.join(patched, name);
      mkdirSync(path.dirname(target), { recursive: true });
      copyFileSync(path.join(source, name), target);
    }
    run("git", ["apply", "--directory=" + patchedRelative, patch]);
    writeFileSync(prepared, JSON.stringify(Object.fromEntries(files.map((name) => [name, digest(path.join(patched, name))]))));
  }

  const targetDir = process.env.CARGO_TARGET_DIR
    ? path.resolve(root, process.env.CARGO_TARGET_DIR)
    : path.join(root, ".haneoka/target");
  try {
    const installed = execFileSync("rustup", ["target", "list", "--installed"], { encoding: "utf8" }).split(/\r?\n/);
    if (!installed.includes("wasm32-unknown-unknown")) {
      run("rustup", ["target", "add", "wasm32-unknown-unknown"]);
    }
  } catch {
    // Non-rustup toolchain; cargo build below verifies wasm32-unknown-unknown availability.
  }

  if (runTests) {
    run("cargo", ["test", "--locked", "--manifest-path", path.join(patched, "Cargo.toml"), "--target-dir", targetDir]);
  }
  run("cargo", [
    "build", "--locked", "--release", "--lib", "--target", "wasm32-unknown-unknown",
    "--manifest-path", path.join(patched, "Cargo.toml"), "--target-dir", targetDir,
  ]);

  mkdirSync(wasmCacheDir, { recursive: true });
  copyFileSync(
    path.join(targetDir, "wasm32-unknown-unknown/release/haneoka_team_engine.wasm"),
    path.join(wasmCacheDir, "team-engine.wasm"),
  );
  for (const name of ["LICENSE", "NOTICE"]) {
    copyFileSync(path.join(source, name), path.join(wasmCacheDir, name));
  }
}

mkdirSync(output, { recursive: true });
run(process.execPath, ["build", "src/lib/deck/haneoka/solver.ts", "--target=browser", "--outfile=" + path.join(output, "solver.mjs")]);
for (const name of cachedAssets) {
  copyFileSync(path.join(wasmCacheDir, name), path.join(output, name));
}
copyFileSync(patch, path.join(output, "moenotes.patch"));

const file = (name) => {
  const bytes = readFileSync(path.join(output, name));
  return { url: name, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
};
writeFileSync(path.join(output, "runtime.json"), JSON.stringify({
  model: { name: "Haneoka", source: "https://github.com/haneoka-gakuen/ournotes-team-builder", commit, patchSha256, patch: file("moenotes.patch") },
  js: file("solver.mjs"), wasm: file("team-engine.wasm"),
}, null, 2) + "\n");
console.log(`Built pinned Haneoka runtime${hasCachedWasm ? " (from cached WASM)" : ""}: ${path.join(output, "runtime.json")}`);
