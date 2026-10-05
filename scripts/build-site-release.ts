import { access, appendFile, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { SUPPORTED_LOCALES } from "../src/config/locales";

export interface BuildInput {
  key: string;
  revision: string;
  commit: string;
  fingerprint: string;
  publicEnv: Record<string, string>;
}
export interface SiteManifest {
  schema: 1;
  key: string;
  revision: string;
  commit: string;
  data: { fingerprint: string; label: string };
  builtAt: string;
  locales: string[];
  sha256: string;
  size: number;
  pages?: number;
}
const OUTPUT = resolve(".site-release");
const ARCHIVE = "site.tar.gz";
const MANIFEST = "site-manifest.json";
const MAX_ARCHIVE = 512 * 1024 * 1024;

export function parseInput(env: Record<string, string | undefined>): BuildInput {
  const key = env.SITE_BUILD_KEY ?? "";
  const revision = env.SITE_BUILD_REVISION ?? "";
  const commit = env.SITE_BUILD_COMMIT ?? "";
  const fingerprint = env.SITE_BUILD_FINGERPRINT ?? "";
  if (!/^[a-f0-9]{16}$/.test(key)) throw new Error("Invalid SITE_BUILD_KEY");
  if (!/^[a-f0-9]{16}$/.test(revision)) throw new Error("Invalid SITE_BUILD_REVISION");
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error("Invalid SITE_BUILD_COMMIT");
  if (!fingerprint || fingerprint.length > 16_384 || /[\x00-\x1f\x7f]/.test(fingerprint)) throw new Error("Invalid SITE_BUILD_FINGERPRINT");
  const raw = env.SITE_PUBLIC_ENV ?? "";
  if (Buffer.byteLength(raw, "utf8") > 48_000) throw new Error("SITE_PUBLIC_ENV exceeds 48000 bytes");
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error("SITE_PUBLIC_ENV must be JSON"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("SITE_PUBLIC_ENV must be an object");
  const entries = Object.entries(value);
  if (entries.length > 100) throw new Error("SITE_PUBLIC_ENV exceeds 100 variables");
  for (const [name, entry] of entries) {
    if (!/^PUBLIC_[A-Z0-9_]+$/.test(name) || typeof entry !== "string" || entry.length > 8192 || entry.includes("\0")) {
      throw new Error("SITE_PUBLIC_ENV must contain bounded PUBLIC_* string values only");
    }
  }
  const expected = createHash("sha256").update(`${revision}\n${fingerprint}\n${commit}`).digest("hex").slice(0, 16);
  if (key !== expected) throw new Error("SITE_BUILD_KEY does not match revision, fingerprint and commit");
  return { key, revision, commit, fingerprint, publicEnv: Object.fromEntries(entries) };
}

/** Run before importing configuration: Bun also loads .env into the initial process environment. */
export function applyBuildEnvironment(input: BuildInput, env = process.env): void {
  for (const name of Object.keys(env)) {
    if (name.startsWith("PUBLIC_") || /TOKEN|SECRET|PASSWORD|CREDENTIAL/i.test(name)) delete env[name];
  }
  Object.assign(env, input.publicEnv, {
    MOENOTES_BUILD_LOCALES: "all", MOENOTES_REVISION: input.commit, ASTRO_TELEMETRY_DISABLED: "1",
  });
  // Never inherit server-only origins or local MasterData overrides on a hosted runner.
  for (const name of ["MOENOTES_ASSET_INTERNAL", "MOENOTES_MASTERDATA_INTERNAL", "MOENOTES_MASTERDATA_DIR", "MOENOTES_VERSION_URL", "MOENOTES_SERVERS"]) delete env[name];
}

export function assertDataVersion(input: BuildInput, data: { fingerprint: string }, lag: string | null): void {
  if (data.fingerprint !== input.fingerprint) throw new Error("Upstream fingerprint changed; refusing release");
  if (lag !== null) throw new Error("Asset export is not synchronized; refusing release");
}

export function validateManifest(value: unknown, input: BuildInput): asserts value is SiteManifest {
  const manifest = value as SiteManifest | null;
  if (!manifest || manifest.schema !== 1 || manifest.key !== input.key || manifest.revision !== input.revision
    || manifest.commit !== input.commit || manifest.data?.fingerprint !== input.fingerprint
    || typeof manifest.data?.label !== "string" || !manifest.data.label
    || typeof manifest.builtAt !== "string" || !Number.isFinite(Date.parse(manifest.builtAt))
    || !Array.isArray(manifest.locales) || manifest.locales.length !== SUPPORTED_LOCALES.length
    || new Set(manifest.locales).size !== SUPPORTED_LOCALES.length
    || !SUPPORTED_LOCALES.every((locale) => manifest.locales.includes(locale))
    || !/^[a-f0-9]{64}$/.test(manifest.sha256) || !Number.isSafeInteger(manifest.size)
    || manifest.size <= 0 || manifest.size > MAX_ARCHIVE
    || (manifest.pages !== undefined && (!Number.isSafeInteger(manifest.pages) || manifest.pages < 0))) {
    throw new Error("Release manifest does not match the requested complete build");
  }
}

export async function hashArchive(path: string): Promise<{ sha256: string; size: number }> {
  const hash = createHash("sha256");
  let size = 0;
  for await (const chunk of createReadStream(path)) {
    size += chunk.length;
    if (size > MAX_ARCHIVE) throw new Error("Site archive exceeds 512 MiB");
    hash.update(chunk);
  }
  return { sha256: hash.digest("hex"), size };
}

export async function command(args: string[], capture = false): Promise<string> {
  return await new Promise((resolve, reject) => {
    // Build/tar logs go straight to the runner. Only short machine-readable gh/git output needs pipes.
    const child = spawn(args[0]!, args.slice(1), { stdio: ["ignore", capture ? "pipe" : "inherit", capture ? "pipe" : "inherit"], shell: false });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr?.on("data", (chunk: Buffer) => {
      // Keep diagnostics bounded even if the site emits a long error log.
      stderr = (stderr + chunk.toString()).slice(-65_536);
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code !== 0) reject(new Error(`${args[0]} failed (${signal ?? code})${stderr ? `: ${stderr}` : "; see command output above"}`));
      else resolve(stdout);
    });
  });
}

export async function measuredCommand(args: string[], reportPath: string): Promise<void> {
  try {
    // time's diagnostics must not share Bun's subprocess stderr pipe. A regular file also preserves
    // the complete RSS/exit status report if logging fails. A nonzero measured command still fails CI.
    await command(["/usr/bin/time", "-v", "-o", reportPath, ...args]);
  } finally {
    try { console.log(await readFile(reportPath, "utf8")); }
    catch { console.warn("Build resource report is unavailable; see the command exit status above"); }
  }
}
async function build(input: BuildInput): Promise<void> {
  applyBuildEnvironment(input);
  if ((await command(["git", "rev-parse", "HEAD"], true)).trim() !== input.commit) {
    throw new Error("Checked-out commit does not match SITE_BUILD_COMMIT");
  }
  // Dynamic imports are essential: configuration snapshots PUBLIC_* at module evaluation.
  const { sourceRevision, describeData, fetchJson, assetExportLag } = await import("../server/upstream");
  const { assetConfig } = await import("../src/config/assets");
  const { masterdataConfig } = await import("../src/config/masterdata");
  if (await sourceRevision(process.cwd()) !== input.revision) throw new Error("Source revision mismatch");
  const currentData = async () => {
    const manifest = await fetchJson<import("../server/upstream").AssetManifest>(`${assetConfig.api}/versions/current_version.json`);
    const data = describeData(manifest);
    const lag = await assetExportLag(manifest, `${Object.values(masterdataConfig.sources)[0]}${masterdataConfig.versionPath}`);
    assertDataVersion(input, data, lag);
    return data;
  };
  const data = await currentData();
  await rm(OUTPUT, { recursive: true, force: true });
  await mkdir(OUTPUT, { recursive: true });
  const cli = join(dirname(createRequire(import.meta.url).resolve("astro/package.json")), "bin", "astro.mjs");
  await measuredCommand([process.execPath, "--bun", cli, "build", "--root", process.cwd(), "--outDir", join(OUTPUT, "site")], join(OUTPUT, "build-metrics.txt"));
  await access(join(OUTPUT, "site", "index.html"));
  await currentData();
  await command(["tar", "--format=ustar", "-czf", join(OUTPUT, ARCHIVE), "-C", OUTPUT, "site"]);
  const digest = await hashArchive(join(OUTPUT, ARCHIVE));
  let pages = 0;
  for (const entry of await readdir(join(OUTPUT, "site"), { recursive: true, withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".html")) pages++;
  }
  const manifest: SiteManifest = {
    schema: 1, key: input.key, revision: input.revision, commit: input.commit, data,
    builtAt: new Date().toISOString(), locales: [...SUPPORTED_LOCALES], ...digest, pages,
  };
  validateManifest(manifest, input);
  await writeFile(join(OUTPUT, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
}

interface Release {
  id: number;
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
  target_commitish: string;
  assets: Array<{ name: string; size: number; state: string }>;
}
function repository(): string {
  const repo = process.env.GITHUB_REPOSITORY ?? "";
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) throw new Error("Invalid GITHUB_REPOSITORY");
  return repo;
}
async function api(path: string, ...args: string[]): Promise<unknown> {
  return JSON.parse(await command(["gh", "api", `repos/${repository()}/${path}`, ...args], true));
}
async function optionalApi(path: string): Promise<unknown | null> {
  try { return await api(path); } catch (error) {
    if (error instanceof Error && /\(HTTP 404\)/.test(error.message)) return null;
    throw error;
  }
}
export async function lookupRelease(
  tag: string,
  includeDrafts: boolean,
  request: (path: string) => Promise<unknown | null>,
): Promise<Release | null> {
  const published = await request(`releases/tags/${tag}`) as Release | null;
  if (published) {
    if (published.tag_name !== tag) throw new Error("Release tag mismatch");
    return published;
  }
  if (!includeDrafts) return null;
  // GitHub's by-tag REST endpoint can return 404 for an existing draft. The authenticated list
  // includes drafts; match tag_name, never its temporary untagged-* browser URL or title.
  for (let page = 1; page <= 10; page++) {
    const entries = await request(`releases?per_page=100&page=${page}`);
    if (!Array.isArray(entries)) throw new Error("Unable to list Releases; refusing to create a duplicate draft");
    const matches = (entries as Release[]).filter(entry => entry.tag_name === tag);
    if (matches.length > 1) throw new Error("Multiple Releases share the requested tag; refusing to overwrite");
    if (matches[0]) return matches[0];
    if (entries.length < 100) return null;
  }
  throw new Error("Release lookup exceeded pagination limit; refusing to create an unverified draft");
}
async function release(input: BuildInput, includeDrafts = false): Promise<Release | null> {
  return lookupRelease(`site-${input.key}`, includeDrafts, optionalApi);
}
async function verifyTag(input: BuildInput, create = false): Promise<void> {
  const tag = `site-${input.key}`;
  const ref = await optionalApi(`git/ref/tags/${tag}`) as { object: { type: string; sha: string } } | null;
  if (!ref) {
    if (!create) throw new Error("Release tag is missing");
    await api("git/refs", "--method", "POST", "-f", `ref=refs/tags/${tag}`, "-f", `sha=${input.commit}`);
    return;
  }
  let object = ref.object;
  for (let depth = 0; object.type === "tag" && depth < 8; depth++) {
    object = (await api(`git/tags/${object.sha}`) as { object: typeof object }).object;
  }
  if (object.type !== "commit" || object.sha !== input.commit) throw new Error("Release tag points at a different source commit");
}
async function verifyFiles(input: BuildInput, directory: string): Promise<void> {
  const manifest: unknown = JSON.parse(await readFile(join(directory, MANIFEST), "utf8"));
  validateManifest(manifest, input);
  const digest = await hashArchive(join(directory, ARCHIVE));
  if (digest.sha256 !== manifest.sha256 || digest.size !== manifest.size) throw new Error("Release archive checksum or size mismatch");
}
async function completeRelease(input: BuildInput, existing: Release): Promise<boolean> {
  if (existing.draft) return false;
  if (!existing.prerelease || existing.target_commitish !== input.commit) throw new Error("Published Release metadata mismatch; cannot overwrite");
  await verifyTag(input);
  for (const name of [ARCHIVE, MANIFEST]) {
    const assets = existing.assets.filter((asset) => asset.name === name && asset.state === "uploaded");
    if (assets.length !== 1 || assets[0]!.size <= 0 || assets[0]!.size > (name === MANIFEST ? 65_536 : MAX_ARCHIVE)) {
      throw new Error("Published Release is incomplete; cannot overwrite");
    }
  }
  const directory = await mkdtemp(join(tmpdir(), "site-release-"));
  try {
    await command(["gh", "release", "download", `site-${input.key}`, "--repo", repository(), "--dir", directory, "--pattern", ARCHIVE, "--pattern", MANIFEST]);
    await verifyFiles(input, directory);
    return true;
  } finally { await rm(directory, { recursive: true, force: true }); }
}
async function publish(input: BuildInput): Promise<void> {
  let existing = await release(input, true);
  if (existing && await completeRelease(input, existing)) return;
  await verifyFiles(input, OUTPUT);
  await verifyTag(input, true);
  const tag = `site-${input.key}`;
  if (!existing) {
    await command(["gh", "release", "create", tag, "--repo", repository(), "--target", input.commit,
      "--verify-tag", "--draft", "--prerelease", "--latest=false", "--title", tag,
      "--notes", "Static site build. Retained until a future manual retention policy; never automatically deleted."]);
  }
  existing = await release(input, true);
  if (!existing?.draft || existing.target_commitish !== input.commit) throw new Error("Release is not the expected draft; cannot overwrite");
  await command(["gh", "release", "upload", tag, join(OUTPUT, ARCHIVE), join(OUTPUT, MANIFEST), "--repo", repository(), "--clobber"]);
  // Only publish after both assets have been uploaded and verified from GitHub.
  const directory = await mkdtemp(join(tmpdir(), "site-release-upload-"));
  try {
    await command(["gh", "release", "download", tag, "--repo", repository(), "--dir", directory, "--pattern", ARCHIVE, "--pattern", MANIFEST]);
    await verifyFiles(input, directory);
  } finally { await rm(directory, { recursive: true, force: true }); }
  await verifyTag(input);
  await command(["gh", "release", "edit", tag, "--repo", repository(), "--draft=false", "--prerelease", "--latest=false", "--target", input.commit]);
}

export async function main(): Promise<void> {
  const input = parseInput(process.env);
  const mode = process.env.SITE_BUILD_MODE ?? "build";
  if (mode === "build") await build(input);
  else if (mode === "inspect") {
    const existing = await release(input);
    const reuse = existing ? await completeRelease(input, existing) : false;
    if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `reuse=${reuse}\n`);
    console.log(reuse ? "Reusing verified published site Release" : "Site Release requires a build");
  } else if (mode === "publish") await publish(input);
  else throw new Error("Invalid SITE_BUILD_MODE");
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Site release failed");
    process.exitCode = 1;
  });
}
