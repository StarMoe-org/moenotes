import { stat } from "node:fs/promises";
import { extname, join, posix } from "node:path";
import { COMPRESSIBLE_EXTENSIONS, ENCODINGS } from "./finalize";

/** Where requests are served from; replaced as a whole when a build goes live. */
export interface SiteRoots {
  current: string | null;
  /** Older builds, newest first. Only `/_astro/` is looked up there (see serveStatic). */
  previous: readonly string[];
}

interface FileInfo {
  path: string;
  size: number;
  mtimeMs: number;
}

const IMMUTABLE = "public, max-age=31536000, immutable";
const REVALIDATE = "no-cache";

/**
 * The Astro output as a static site: `{path}`, `{path}/index.html`, `{path}.html`, then `/404.html`.
 *
 * `/_astro/` files are content-hashed, so they are cached for a year and, when missing from the live build,
 * looked up in earlier builds: a page loaded just before a swap still finds its scripts afterwards.
 */
export async function serveStatic(request: Request, roots: SiteRoots): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method Not Allowed\n", { status: 405, headers: { allow: "GET, HEAD" } });
  }
  if (!roots.current) {
    return new Response("MoeNotes is being built for the first time. Please retry in a few minutes.\n", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "retry-after": "60" },
    });
  }

  const pathname = sitePath(new URL(request.url).pathname);
  if (pathname === null) return new Response("Bad Request\n", { status: 400 });

  const immutable = pathname.startsWith("/_astro/");
  let file = await findFile(roots.current, pathname);
  if (!file && immutable) {
    for (const root of roots.previous) {
      file = await fileInfo(join(root, pathname));
      if (file) break;
    }
  }
  if (file) return fileResponse(request, file, 200, immutable ? IMMUTABLE : REVALIDATE);

  const notFound = await fileInfo(join(roots.current, "404.html"));
  return notFound ? fileResponse(request, notFound, 404, REVALIDATE) : new Response("Not Found\n", { status: 404 });
}

/** The decoded request path, confined to the site root; null when it cannot name a file. */
function sitePath(raw: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  if (decoded.includes("\0") || decoded.includes("\\")) return null;
  // Normalizing an absolute path drops `..` segments that would climb above the root.
  return posix.normalize(decoded.startsWith("/") ? decoded : `/${decoded}`);
}

async function findFile(root: string, pathname: string): Promise<FileInfo | null> {
  const base = join(root, pathname);
  const candidates = pathname.endsWith("/") ? [join(base, "index.html")] : [base, join(base, "index.html"), `${base}.html`];
  for (const candidate of candidates) {
    const file = await fileInfo(candidate);
    if (file) return file;
  }
  return null;
}

async function fileInfo(path: string): Promise<FileInfo | null> {
  try {
    const info = await stat(path);
    return info.isFile() ? { path, size: info.size, mtimeMs: info.mtimeMs } : null;
  } catch {
    return null;
  }
}

async function fileResponse(request: Request, file: FileInfo, status: number, cacheControl: string): Promise<Response> {
  const headers = new Headers({ "content-type": Bun.file(file.path).type, "cache-control": cacheControl });

  let served = file;
  let encoding: string | undefined;
  if (COMPRESSIBLE_EXTENSIONS.has(extname(file.path).toLowerCase())) {
    headers.set("vary", "Accept-Encoding");
    const accepted = acceptedEncodings(request.headers.get("accept-encoding"));
    for (const { name, suffix } of ENCODINGS) {
      if (!accepted.has(name)) continue;
      const variant = await fileInfo(file.path + suffix);
      if (variant) {
        served = variant;
        encoding = name;
        break;
      }
    }
  }
  if (encoding) headers.set("content-encoding", encoding);

  // Finalize hard-links unchanged files across builds, so size + mtime stays stable while the content does.
  const etag = `"${served.size.toString(36)}-${Math.floor(served.mtimeMs).toString(36)}${encoding ? `-${encoding}` : ""}"`;
  headers.set("etag", etag);
  headers.set("last-modified", new Date(served.mtimeMs).toUTCString());

  if (status === 200 && matchesEtag(request.headers.get("if-none-match"), etag)) {
    return new Response(null, { status: 304, headers });
  }
  headers.set("content-length", String(served.size));
  return new Response(request.method === "HEAD" ? null : Bun.file(served.path), { status, headers });
}

function acceptedEncodings(header: string | null): Set<string> {
  const accepted = new Set<string>();
  for (const part of (header ?? "").split(",")) {
    const [token, ...params] = part.trim().toLowerCase().split(";");
    const q = params.map((param) => param.trim()).find((param) => param.startsWith("q="));
    if (token && (!q || Number(q.slice(2)) > 0)) accepted.add(token);
  }
  return accepted;
}

function matchesEtag(header: string | null, etag: string): boolean {
  if (!header) return false;
  return header.split(",").some((tag) => {
    const value = tag.trim();
    return value === "*" || value === etag || value === `W/${etag}`;
  });
}
