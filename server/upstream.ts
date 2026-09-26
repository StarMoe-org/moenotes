import { join } from "node:path";
import { buildFetch } from "../src/lib/build/fetch";

/** The asset service's `versions/current_version.json` (moenotes-assets docs/API.md, Version tracking). */
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

export async function fetchJson<T>(url: string): Promise<T> {
  const response = await buildFetch(url, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
  return await response.json() as T;
}

function sortedEntries<T>(record: Record<string, T> | undefined): Array<[string, T]> {
  return Object.entries(record ?? {}).sort(([a], [b]) => a.localeCompare(b));
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

/**
 * Why the published assets may not cover the MasterData a build would read right now, or null when they do.
 * MasterData moves first and the asset export follows, so a build in between would render pages whose story
 * tables are not published yet.
 */
export async function assetExportLag(manifest: AssetManifest, masterdataVersionUrl: string): Promise<string | null> {
  const pending = Object.keys(manifest.pending ?? {});
  if (pending.length) return `asset release still running for ${pending.join(", ")}`;

  const masterdata = await fetchJson<MasterdataManifest>(masterdataVersionUrl);
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

/**
 * Hash of everything in the image that shapes the site: sources, public files, dependency lock and build
 * config, plus PUBLIC_* variables (inlined into pages). A new image with changed code therefore rebuilds even
 * when the data did not move.
 */
export async function sourceRevision(appDir: string): Promise<string> {
  const files = ["astro.config.mjs", "package.json", "bun.lock", "tsconfig.json"];
  for (const dir of ["src", "public"]) {
    for await (const file of new Bun.Glob("**/*").scan({ cwd: join(appDir, dir), onlyFiles: true, dot: true })) {
      files.push(`${dir}/${file.replaceAll("\\", "/")}`);
    }
  }
  files.sort();

  const hasher = new Bun.CryptoHasher("sha256");
  for (const file of files) {
    hasher.update(`${file}\0`);
    hasher.update(await Bun.file(join(appDir, file)).bytes());
    hasher.update("\0");
  }
  for (const [name, value] of sortedEntries(process.env)) {
    if (name.startsWith("PUBLIC_")) hasher.update(`${name}=${value ?? ""}\0`);
  }
  return hasher.digest("hex").slice(0, 16);
}

export function buildKey(revision: string, data: DataVersion): string {
  return new Bun.CryptoHasher("sha256").update(`${revision}\n${data.fingerprint}`).digest("hex").slice(0, 16);
}
