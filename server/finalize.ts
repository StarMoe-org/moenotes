/**
 * Prepares a fresh build before it goes live. Files identical to the live build's are hard-linked to them
 * together with their compressed variants; the rest get brotli and gzip variants next to them (`page.html.br`,
 * `page.html.gz`) for the static server. Pages untouched by a data update thus cost no disk or compression
 * time, and keep their mtime-based ETags so browsers revalidate them with 304.
 *
 *   bun server/finalize.ts <site dir> <manifest out> [<previous site dir> <previous manifest>]
 *
 * The manifest (relative path → size and SHA-256) lives outside the site so it is never served.
 */
import { link, rename, rm } from "node:fs/promises";
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

export type SiteManifest = Record<string, [size: number, sha256: string]>;

export interface FinalizeResult {
  manifest: SiteManifest;
  files: number;
  linked: number;
  compressed: number;
}

export async function finalizeSite(site: string, previous?: { site: string; manifest: SiteManifest }): Promise<FinalizeResult> {
  // Listed up front: the loop adds variants to the same tree.
  const files: string[] = [];
  for await (const file of new Bun.Glob("**/*").scan({ cwd: site, onlyFiles: true, dot: true })) files.push(file.replaceAll("\\", "/"));
  files.sort();

  const manifest: SiteManifest = {};
  let linked = 0;
  let compressed = 0;
  for (const file of files) {
    const path = join(site, file);
    const bytes = await Bun.file(path).bytes();
    const sha256 = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
    manifest[file] = [bytes.length, sha256];

    const before = previous?.manifest[file];
    if (previous && before?.[0] === bytes.length && before[1] === sha256 && await replaceWithLink(join(previous.site, file), path)) {
      for (const { suffix } of ENCODINGS) await replaceWithLink(join(previous.site, file) + suffix, path + suffix);
      linked += 1;
      continue;
    }

    if (bytes.length < MIN_BYTES || !COMPRESSIBLE_EXTENSIONS.has(extname(file).toLowerCase())) continue;
    const variants = {
      br: brotliCompressSync(bytes, {
        params: { [constants.BROTLI_PARAM_QUALITY]: 9, [constants.BROTLI_PARAM_SIZE_HINT]: bytes.length },
      }),
      gzip: Bun.gzipSync(bytes, { level: 9 }),
    };
    for (const { name, suffix } of ENCODINGS) {
      if (variants[name].length <= bytes.length * MAX_RATIO) await Bun.write(path + suffix, variants[name]);
    }
    compressed += 1;
  }
  return { manifest, files: files.length, linked, compressed };
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

async function readManifest(path: string | undefined): Promise<SiteManifest | undefined> {
  if (!path) return undefined;
  const file = Bun.file(path);
  return await file.exists() ? await file.json() as SiteManifest : undefined;
}

if (import.meta.main) {
  const [site, manifestOut, previousSite, previousManifestPath] = process.argv.slice(2);
  if (!site || !manifestOut) {
    console.error("usage: bun server/finalize.ts <site dir> <manifest out> [<previous site dir> <previous manifest>]");
    process.exit(2);
  }
  const previousManifest = await readManifest(previousManifestPath);
  const startedAt = performance.now();
  const result = await finalizeSite(site, previousSite && previousManifest ? { site: previousSite, manifest: previousManifest } : undefined);
  await Bun.write(manifestOut, JSON.stringify(result.manifest));
  const seconds = ((performance.now() - startedAt) / 1000).toFixed(1);
  console.log(`[finalize] ${result.files} files: ${result.linked} unchanged (linked to the live build), ${result.compressed} compressed, ${seconds}s`);
}
