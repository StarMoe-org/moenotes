/**
 * Prepares builds for the static server in two steps.
 *
 * `link` runs before a build goes live: files identical to the live build's are hard-linked to them together
 * with their compressed variants. Pages untouched by a data update thus cost no disk or compression time, and
 * keep their mtime-based ETags so browsers revalidate them with 304. It also writes the manifest (relative
 * path → size and SHA-256), which lives outside the site so it is never served.
 *
 * `compress` runs in the background once the build is live: every compressible file without variants gets
 * brotli and gzip ones next to it (`page.html.br`, `page.html.gz`). Until then the server sends the file as is.
 * Variants appear atomically, and a run picks up whatever an interrupted one left out.
 *
 *   bun server/finalize.ts link <site dir> <manifest out> [<previous site dir> <previous manifest>]
 *   bun server/finalize.ts compress <site dir>
 */
import { link, rename, rm } from "node:fs/promises";
import { setPriority } from "node:os";
import { extname, join } from "node:path";
import { brotliCompressSync, constants } from "node:zlib";

/** Precompressed variants, in the server's order of preference. */
export const ENCODINGS = [
  { name: "br", suffix: ".br" },
  { name: "gzip", suffix: ".gz" },
] as const;

export const COMPRESSIBLE_EXTENSIONS: ReadonlySet<string> = new Set([
  ".html", ".js", ".mjs", ".css", ".json", ".map", ".svg", ".xml", ".txt", ".wasm", ".webmanifest", ".ico", ".ttf", ".otf",
]);

const MIN_BYTES = 1024;
/** A variant is kept only when it is at most this share of the original. */
const MAX_RATIO = 0.9;
/** Names of the files `replaceWithLink` and `writeAtomically` rename into place. */
const TEMPORARY = /\.(?:link|tmp)-\d+$/;

export type SiteManifest = Record<string, [size: number, sha256: string]>;

export interface LinkResult {
  manifest: SiteManifest;
  files: number;
  linked: number;
}

export interface CompressResult {
  files: number;
  compressed: number;
}

export async function linkSite(site: string, previous?: { site: string; manifest: SiteManifest }): Promise<LinkResult> {
  // Astro renders from server chunks in <outDir>/.prerender and deletes them afterwards; never publish them.
  await rm(join(site, ".prerender"), { recursive: true, force: true });
  // Listed up front: the loop adds variants to the same tree.
  const files = await listFiles(site);

  const manifest: SiteManifest = {};
  let linked = 0;
  for (const file of files) {
    const path = join(site, file);
    const bytes = await Bun.file(path).bytes();
    const sha256 = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
    manifest[file] = [bytes.length, sha256];

    const before = previous?.manifest[file];
    if (previous && before?.[0] === bytes.length && before[1] === sha256 && await replaceWithLink(join(previous.site, file), path)) {
      for (const { suffix } of ENCODINGS) await replaceWithLink(join(previous.site, file) + suffix, path + suffix);
      linked += 1;
    }
  }
  return { manifest, files: files.length, linked };
}

/**
 * Adds variants to every compressible file that lacks one. Safe while the site is served; a file missing a
 * variant (one too large to keep, or cut off by an interrupted run) is compressed again on each run.
 */
export async function compressSite(site: string): Promise<CompressResult> {
  const files = await listFiles(site);
  const present = new Set(files);
  let compressed = 0;
  for (const file of files) {
    const path = join(site, file);
    if (TEMPORARY.test(file)) {
      await rm(path, { force: true });
      continue;
    }
    if (!COMPRESSIBLE_EXTENSIONS.has(extname(file).toLowerCase())) continue;
    if (ENCODINGS.every(({ suffix }) => present.has(file + suffix))) continue;
    const bytes = await Bun.file(path).bytes();
    if (bytes.length < MIN_BYTES) continue;

    const variants = {
      br: brotliCompressSync(bytes, {
        params: { [constants.BROTLI_PARAM_QUALITY]: 9, [constants.BROTLI_PARAM_SIZE_HINT]: bytes.length },
      }),
      gzip: Bun.gzipSync(bytes, { level: 9 }),
    };
    for (const { name, suffix } of ENCODINGS) {
      if (variants[name].length <= bytes.length * MAX_RATIO) await writeAtomically(path + suffix, variants[name]);
    }
    compressed += 1;
  }
  return { files: files.length, compressed };
}

async function listFiles(site: string): Promise<string[]> {
  const files: string[] = [];
  for await (const file of new Bun.Glob("**/*").scan({ cwd: site, onlyFiles: true, dot: true })) files.push(file.replaceAll("\\", "/"));
  return files.sort();
}

/** Hard-links `from` over `to` in one rename; false (and `to` untouched) when `from` cannot be linked. */
async function replaceWithLink(from: string, to: string): Promise<boolean> {
  const temporary = `${to}.link-${process.pid}`;
  try {
    await link(from, temporary);
  } catch {
    return false;
  }
  try {
    await rename(temporary, to);
    return true;
  } catch {
    await rm(temporary, { force: true });
    return false;
  }
}

/** A request never sees a partly written variant: it appears complete or not at all. */
async function writeAtomically(path: string, data: Uint8Array): Promise<void> {
  const temporary = `${path}.tmp-${process.pid}`;
  await Bun.write(temporary, data);
  await rename(temporary, path);
}

async function readManifest(path: string | undefined): Promise<SiteManifest | undefined> {
  if (!path) return undefined;
  const file = Bun.file(path);
  return await file.exists() ? await file.json() as SiteManifest : undefined;
}

if (import.meta.main) {
  const [mode, site, ...rest] = process.argv.slice(2);
  const startedAt = performance.now();
  const seconds = () => ((performance.now() - startedAt) / 1000).toFixed(1);
  if (mode === "link" && site && rest[0]) {
    const [manifestOut, previousSite, previousManifestPath] = rest;
    const previousManifest = await readManifest(previousManifestPath);
    const result = await linkSite(site, previousSite && previousManifest ? { site: previousSite, manifest: previousManifest } : undefined);
    await Bun.write(manifestOut, JSON.stringify(result.manifest));
    console.log(`[finalize] ${result.files} files: ${result.linked} unchanged (linked to the live build), ${seconds()}s`);
  } else if (mode === "compress" && site) {
    // The live site is being served meanwhile; requests come first.
    try {
      setPriority(10);
    } catch {}
    const result = await compressSite(site);
    console.log(`[finalize] ${result.files} files: ${result.compressed} compressed, ${seconds()}s`);
  } else {
    console.error("usage: bun server/finalize.ts link <site dir> <manifest out> [<previous site dir> <previous manifest>]");
    console.error("       bun server/finalize.ts compress <site dir>");
    process.exit(2);
  }
}
