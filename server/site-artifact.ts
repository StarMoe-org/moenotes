import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, mkdir, open, realpath, rm, type FileHandle } from "node:fs/promises";
import { resolve, join } from "node:path";
import { Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import { LOCALE_PATH_PREFIX, SUPPORTED_LOCALES } from "../src/config/locales";

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

type ExpectedSite = Pick<SiteManifest, "key" | "revision" | "commit" | "data">;
export const SITE_ARTIFACT_LIMITS = Object.freeze({
  compressedBytes: 512 * 1024 * 1024,
  expandedBytes: 4 * 1024 * 1024 * 1024,
  fileBytes: 512 * 1024 * 1024,
  entries: 250_000,
  timeoutMs: 10 * 60 * 1000,
});

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid site manifest object");
  return value as Record<string, unknown>;
}
function text(value: unknown, maxLength = 1024): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength && !/[\x00-\x1f\x7f]/.test(value);
}

export function validateSiteManifest(raw: unknown, expected: ExpectedSite): SiteManifest {
  const m = object(raw);
  const data = object(m.data);
  if (m.schema !== 1) throw new Error("Unsupported site manifest schema");
  const identifiers: Record<"key" | "revision" | "commit", RegExp> = {
    key: /^[a-f0-9]{16}$/,
    revision: /^[a-f0-9]{16}$/,
    commit: /^[a-f0-9]{40}$/,
  };
  for (const field of ["key", "revision", "commit"] as const) {
    if (!identifiers[field].test(String(m[field] ?? "")) || !identifiers[field].test(String(expected[field] ?? ""))
      || m[field] !== expected[field]) throw new Error(`Site manifest ${field} mismatch`);
  }
  if (!text(data.fingerprint, 16_384) || !text(expected.data.fingerprint, 16_384)
    || data.fingerprint !== expected.data.fingerprint) throw new Error("Site manifest data.fingerprint mismatch");
  if (!text(data.label) || !text(expected.data.label) || data.label !== expected.data.label) {
    throw new Error("Site manifest data.label mismatch");
  }
  if (typeof m.builtAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(m.builtAt)) {
    throw new Error("Invalid site manifest builtAt");
  }
  const date = new Date(m.builtAt);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== m.builtAt.replace(/Z$/, m.builtAt.includes(".") ? "Z" : ".000Z")
    || date.getTime() < Date.UTC(2000, 0, 1) || date.getTime() > Date.now() + 86_400_000) {
    throw new Error("Unsafe site manifest builtAt");
  }
  const locales = m.locales;
  if (!Array.isArray(locales) || locales.length !== SUPPORTED_LOCALES.length
    || new Set(locales).size !== SUPPORTED_LOCALES.length
    || SUPPORTED_LOCALES.some((locale) => !locales.includes(locale))) {
    throw new Error("Site manifest must contain every supported locale exactly once");
  }
  if (typeof m.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(m.sha256)) throw new Error("Invalid site manifest sha256");
  if (!Number.isSafeInteger(m.size) || (m.size as number) <= 0 || (m.size as number) > SITE_ARTIFACT_LIMITS.compressedBytes) {
    throw new Error("Invalid site manifest size");
  }
  if (m.pages !== undefined && (!Number.isSafeInteger(m.pages) || (m.pages as number) <= 0 || (m.pages as number) > SITE_ARTIFACT_LIMITS.entries)) {
    throw new Error("Invalid site manifest pages");
  }
  return {
    schema: 1, key: m.key as string, revision: m.revision as string, commit: m.commit as string,
    data: { fingerprint: data.fingerprint as string, label: data.label as string }, builtAt: m.builtAt,
    locales: [...locales] as string[], sha256: m.sha256, size: m.size as number,
    ...(m.pages === undefined ? {} : { pages: m.pages as number }),
  };
}

function field(header: Buffer, start: number, length: number): string {
  const bytes = header.subarray(start, start + length);
  const end = bytes.indexOf(0);
  if (end >= 0 && bytes.subarray(end).some((byte) => byte !== 0)) throw new Error("Invalid tar string padding");
  return new TextDecoder("utf-8", { fatal: true }).decode(end < 0 ? bytes : bytes.subarray(0, end));
}
function octal(header: Buffer, start: number, length: number): number {
  const bytes = header.subarray(start, start + length);
  const raw = bytes.toString("ascii");
  if (bytes.some((byte) => byte > 127) || !/^[ 0-7]*[\0 ]*$/.test(raw)) throw new Error("Unsupported tar numeric encoding");
  const value = parseInt(raw.replace(/[\0 ]+$/g, "").trim() || "0", 8);
  if (!Number.isSafeInteger(value)) throw new Error("Unsafe tar number");
  return value;
}

/** Strict ustar only. PAX, GNU longname, links and special files are intentionally rejected. */
export function validateSiteTarHeader(header: Buffer): { path: string; size: number; directory: boolean } {
  if (header.length !== 512) throw new Error("Invalid tar header size");
  let checksum = 0;
  for (let i = 0; i < 512; i++) checksum += i >= 148 && i < 156 ? 32 : header[i]!;
  if (checksum !== octal(header, 148, 8)) throw new Error("Invalid tar header checksum");
  if (header.subarray(257, 263).toString("ascii") !== "ustar\0" || header.subarray(263, 265).toString("ascii") !== "00") {
    throw new Error("Unsupported tar format: require POSIX ustar");
  }
  const type = header[156];
  if (type !== 0 && type !== 48 && type !== 53) throw new Error(`Unsupported tar entry type ${String.fromCharCode(type!)}: only regular files and directories allowed (no links/PAX/GNU longname)`);
  if (field(header, 157, 100)) throw new Error("Tar link target is forbidden");
  const prefix = field(header, 345, 155);
  let path = `${prefix ? `${prefix}/` : ""}${field(header, 0, 100)}`;
  const directory = type === 53;
  if (path.startsWith("./")) path = path.slice(2);
  if (directory && path.endsWith("/")) path = path.slice(0, -1);
  const parts = path.split("/");
  if (path.length > 1024 || parts.length > 32 || parts[0] !== "site" || (!directory && parts.length === 1)
    || parts.some((part) => !part || part === "." || part === ".." || /[\\:\x00-\x1f\x7f]/.test(part)
      || /[. ]$/.test(part) || /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part))) {
    throw new Error(`Unsafe tar path: ${path}`);
  }
  const size = octal(header, 124, 12);
  if (directory && size !== 0) throw new Error("Tar directory has nonzero size");
  return { path, size, directory };
}

async function writeAll(file: FileHandle, chunk: Uint8Array): Promise<void> {
  let offset = 0;
  while (offset < chunk.length) {
    const { bytesWritten } = await file.write(chunk, offset, chunk.length - offset);
    if (!bytesWritten) throw new Error("Short artifact write");
    offset += bytesWritten;
  }
}

/** Testable bounded streaming extractor. Caller owns a fresh staging/site directory. */
export async function extractSiteTarGzip(archive: string, staging: string, options: {
  signal?: AbortSignal; maxExpandedBytes?: number; maxFileBytes?: number; maxEntries?: number;
} = {}): Promise<void> {
  const header = Buffer.alloc(512);
  let filled = 0, remaining = 0, padding = 0, expanded = 0, entries = 0, zeroBlocks = 0;
  let file: FileHandle | undefined;
  const seen = new Set<string>();
  const directories = new Set<string>(["site"]);
  const maxExpanded = Math.min(options.maxExpandedBytes ?? SITE_ARTIFACT_LIMITS.expandedBytes, SITE_ARTIFACT_LIMITS.expandedBytes);
  const maxFile = Math.min(options.maxFileBytes ?? SITE_ARTIFACT_LIMITS.fileBytes, SITE_ARTIFACT_LIMITS.fileBytes);
  const maxEntries = Math.min(options.maxEntries ?? SITE_ARTIFACT_LIMITS.entries, SITE_ARTIFACT_LIMITS.entries);
  if (![maxExpanded, maxFile, maxEntries].every((n) => Number.isSafeInteger(n) && n > 0)) throw new Error("Invalid tar limits");
  const consume = async (chunk: Buffer) => {
    expanded += chunk.length;
    if (expanded > maxExpanded) throw new Error("Tar expanded size limit exceeded");
    let offset = 0;
    while (offset < chunk.length) {
      options.signal?.throwIfAborted();
      if (remaining) {
        const length = Math.min(remaining, chunk.length - offset);
        await writeAll(file!, chunk.subarray(offset, offset + length));
        offset += length;
        remaining -= length;
        if (!remaining) { await file!.close(); file = undefined; }
      } else if (padding) {
        const length = Math.min(padding, chunk.length - offset);
        if (chunk.subarray(offset, offset + length).some((byte) => byte !== 0)) throw new Error("Nonzero tar padding");
        offset += length;
        padding -= length;
      } else {
        const length = Math.min(512 - filled, chunk.length - offset);
        chunk.copy(header, filled, offset, offset + length);
        filled += length;
        offset += length;
        if (filled !== 512) continue;
        filled = 0;
        if (header.every((byte) => byte === 0)) { zeroBlocks++; continue; }
        if (zeroBlocks) throw new Error("Tar content after end marker");
        if (++entries > maxEntries) throw new Error("Tar entry count limit exceeded");
        const entry = validateSiteTarHeader(header);
        if (entry.size > maxFile || expanded + entry.size > maxExpanded) throw new Error("Tar expanded/file size limit exceeded");
        // Case-folding also rejects aliases on case-insensitive deployment filesystems.
        const key = entry.path.toLowerCase();
        if (seen.has(key)) throw new Error(`Duplicate tar path: ${entry.path}`);
        seen.add(key);
        const parts = entry.path.split("/");
        for (let i = 1; i < parts.length; i++) {
          const parent = parts.slice(0, i).join("/");
          if (!directories.has(parent)) {
            await mkdir(join(staging, parent));
            directories.add(parent);
          }
        }
        if (entry.directory) {
          if (!directories.has(entry.path)) {
            await mkdir(join(staging, entry.path));
            directories.add(entry.path);
          }
        } else {
          file = await open(join(staging, entry.path), "wx", 0o644);
          remaining = entry.size;
          padding = (512 - entry.size % 512) % 512;
          if (!remaining) { await file.close(); file = undefined; }
        }
      }
    }
  };
  try {
    await pipeline(createReadStream(archive), createGunzip(), new Writable({
      write(chunk: Buffer, _encoding, callback) { consume(chunk).then(() => callback(), callback); },
    }), { signal: options.signal });
    if (remaining || padding || filled || zeroBlocks < 2) throw new Error("Truncated tar archive or missing end marker");
  } finally {
    await file?.close();
  }
}

function publicUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("Artifact URL must be public HTTPS without credentials");
  return url;
}
async function download(url: string, file: FileHandle, manifest: SiteManifest, signal: AbortSignal): Promise<void> {
  let target = publicUrl(url);
  let response: Response | undefined;
  for (let redirects = 0; redirects <= 5; redirects++) {
    signal.throwIfAborted();
    // Never attach the GitHub API token, even to the initial release URL.
    response = await fetch(target, { signal, redirect: "manual", credentials: "omit" });
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    await response.body?.cancel();
    const location = response.headers.get("location");
    if (!location || redirects === 5) throw new Error("Invalid artifact redirect");
    target = publicUrl(new URL(location, target).href);
  }
  if (!response?.ok || !response.body) { await response?.body?.cancel(); throw new Error(`Artifact download failed: HTTP ${response?.status}`); }
  const reader = response.body.getReader();
  const hash = createHash("sha256");
  let size = 0;
  try {
    const length = response.headers.get("content-length");
    if (length !== null && (!/^\d+$/.test(length) || Number(length) !== manifest.size)) throw new Error("Artifact download size mismatch");
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > manifest.size || size > SITE_ARTIFACT_LIMITS.compressedBytes) throw new Error("Artifact download size limit exceeded");
      hash.update(value);
      await writeAll(file, value);
    }
    if (size !== manifest.size) throw new Error("Artifact download size mismatch");
    if (hash.digest("hex") !== manifest.sha256) throw new Error("Artifact sha256 mismatch");
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/** staging must already exist and be caller-owned; an existing site/archive is never replaced. */
export async function installSiteArtifact(url: string, staging: string, manifest: SiteManifest, options: { signal?: AbortSignal } = {}): Promise<void> {
  manifest = validateSiteManifest(manifest, manifest);
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(new Error("Site artifact installation timed out")), SITE_ARTIFACT_LIMITS.timeoutMs);
  const signal = AbortSignal.any([timeout.signal, ...(options.signal ? [options.signal] : [])]);
  try {
    await installWithSignal(url, staging, manifest, signal);
  } finally {
    clearTimeout(timer);
  }
}

async function installWithSignal(url: string, staging: string, manifest: SiteManifest, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  const root = resolve(staging);
  const actual = await realpath(root);
  const canonical = (path: string) => process.platform === "win32" ? path.toLowerCase() : path;
  if (!(await lstat(root)).isDirectory() || canonical(actual) !== canonical(root)) throw new Error("Staging must be a real directory without symlink ancestors");
  const archive = join(root, "site.tar.gz");
  const site = join(root, "site");
  let ownSite = false, ownArchive = false;
  let file: FileHandle | undefined;
  try {
    await mkdir(site);
    ownSite = true;
    file = await open(archive, "wx", 0o600);
    ownArchive = true;
    await download(url, file, manifest, signal);
    await file.close();
    file = undefined;
    await extractSiteTarGzip(archive, root, { signal });
    for (const locale of SUPPORTED_LOCALES) {
      if (!(await lstat(join(site, LOCALE_PATH_PREFIX[locale], "index.html"))).isFile()) throw new Error(`Missing site homepage: ${locale}`);
    }
    if (!(await lstat(join(site, "_astro"))).isDirectory()) throw new Error("Missing site _astro directory");
    signal.throwIfAborted();
    await rm(archive);
    ownArchive = false;
  } catch (error) {
    await file?.close();
    if (ownSite) await rm(site, { recursive: true, force: true });
    if (ownArchive) await rm(archive, { force: true });
    throw error;
  }
}
