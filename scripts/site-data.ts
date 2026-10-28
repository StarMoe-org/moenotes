/**
 * The data and source identity of a site build, as the Go deploy server (server/internal/upstream) computes it:
 * the exported data version of the asset service's release manifest, whether the export has caught up with
 * MasterData, and the source digest of the checkout. The Actions build re-checks them before and after rendering;
 * tests/site-data.test.ts keeps both implementations in agreement.
 */
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

/** The asset service's `versions/current_version.json`. */
export interface AssetManifest {
  regions?: Record<string, AssetRegion>;
  /** Releases still queued or running, by region. */
  pending?: Record<string, unknown>;
}

interface AssetRegion {
  resource_version?: string;
  master_version?: string;
  /** The metadata service region this release was exported from; "" opts out of version tracking. */
  metadata_region?: string;
  locales?: Record<string, { snapshot?: string }>;
}

interface MasterdataManifest {
  regions?: Record<string, { version?: string }>;
}

export interface DataVersion {
  /** Changes whenever an exported release differs: resource or MasterData version, or any locale snapshot. */
  fingerprint: string;
  /** Short human-readable form for logs and the status endpoint. */
  label: string;
}

/** Go's sort.Strings order: byte-wise, not locale-aware. */
function byteOrder(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function sortedEntries<T>(record: Record<string, T> | undefined): Array<[string, T]> {
  return Object.entries(record ?? {}).sort(([a], [b]) => byteOrder(a, b));
}

export function describeData(manifest: AssetManifest): DataVersion {
  const regions = sortedEntries(manifest.regions);
  if (!regions.length) throw new Error("the asset manifest lists no released region");
  const fingerprint = regions.map(([name, region]) => {
    const locales = sortedEntries(region.locales).map(([locale, entry]) => `${locale}=${entry.snapshot ?? ""}`);
    return `${name}:${region.resource_version ?? ""}:${region.master_version ?? ""}:${locales.join(",")}`;
  }).join(";");
  const label = regions.map(([name, region]) => `${name}@${region.resource_version ?? "?"}`).join(" ");
  return { fingerprint, label };
}

export async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store", headers: { accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
  return await response.json() as T;
}

/**
 * Why the published assets may not cover the MasterData a build would read right now, or null when they do.
 * Only regions with an exported release count.
 */
export async function assetExportLag(
  manifest: AssetManifest,
  masterdataVersionUrl: string,
  load: (url: string) => Promise<MasterdataManifest> = fetchJson,
): Promise<string | null> {
  const released = new Set(Object.keys(manifest.regions ?? {}));
  const pending = Object.keys(manifest.pending ?? {}).filter((name) => released.has(name)).sort(byteOrder);
  if (pending.length) return `asset release still running for ${pending.join(", ")}`;
  const masterdata = await load(masterdataVersionUrl);
  for (const [name, region] of sortedEntries(manifest.regions)) {
    const metadataRegion = region.metadata_region ?? name;
    if (!metadataRegion || !region.master_version) continue;
    const current = masterdata.regions?.[metadataRegion]?.version;
    if (current && current !== region.master_version) {
      return `MasterData ${metadataRegion} is at ${current}, assets exported ${region.master_version}`;
    }
  }
  return null;
}

const SOURCE_FILES = ["next.config.ts", "postcss.config.mjs", "package.json", "bun.lock", "tsconfig.json"];
const SOURCE_DIRS = ["src", "public"];

async function listFiles(root: string, dir: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(join(root, dir), { recursive: true, withFileTypes: true })) {
    if (entry.isFile()) files.push(relative(root, join(entry.parentPath, entry.name)).split(sep).join("/"));
  }
  return files;
}

/** SHA-256 over the files that shape the site; the image ships it as /app/source-digest. */
export async function sourceDigest(root: string): Promise<string> {
  const files = [...SOURCE_FILES];
  for (const dir of SOURCE_DIRS) files.push(...await listFiles(root, dir));
  files.sort(byteOrder);
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(`${file}\0`);
    hash.update(await readFile(join(root, file)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

/** The source digest combined with the PUBLIC_* settings, which pages inline. */
export function sourceRevision(digest: string, env: Record<string, string | undefined>): string {
  const hash = createHash("sha256").update(`moenotes-source-v2\n${digest}\n`);
  const names = Object.keys(env).filter((name) => name.startsWith("PUBLIC_")).sort(byteOrder);
  for (const name of names) hash.update(`${name}=${env[name] ?? ""}\0`);
  return hash.digest("hex").slice(0, 16);
}

/** One site build: its source revision, its data and the exact commit CI checks out. */
export function buildKey(revision: string, fingerprint: string, commit: string): string {
  return createHash("sha256").update(`${revision}\n${fingerprint}\n${commit}`).digest("hex").slice(0, 16);
}
