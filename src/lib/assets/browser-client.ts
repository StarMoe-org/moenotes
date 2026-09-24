import { assetConfig } from "@/config/assets";
import type { AssetArchive, ArchiveFile, ArchivePage, ArchiveFilePage, AssetBrowserPage, AssetCatalog } from "@/types/asset-browser";

export const ASSET_BROWSER_PAGE_SIZE = 50;
const MAX_OFFSET = 10_000_000;

export class AssetBrowserError extends Error {
  constructor(public readonly status: number) {
    super(`Asset browser request failed (${status})`);
  }
}

export function assetBrowserUrl(path: string, query: Record<string, string | number> = {}): string {
  const url = new URL(`${assetConfig.browserApi}/${path}`);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
  return url.toString();
}

export function archivePageUrl(snapshot: string, prefix: string, offset: number, archiveId?: string): string {
  const path = archiveId ? `bundles/${encodeURIComponent(archiveId)}/assets` : "bundles";
  return assetBrowserUrl(path, { snapshot, prefix, offset, limit: ASSET_BROWSER_PAGE_SIZE });
}

export async function fetchAssetBrowser<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, credentials: "omit", cache: "no-store", headers: { Accept: "application/json" } });
  if (!response.ok) throw new AssetBrowserError(response.status);
  return response.json() as Promise<T>;
}

export function defaultCatalog(catalogs: AssetCatalog[]): AssetCatalog | undefined {
  return [...catalogs].sort((a, b) => Number(b.current) - Number(a.current) || b.created - a.created)[0];
}

export function nextPageOffset(page: AssetBrowserPage): number | null {
  const next = page.offset + page.limit;
  return page.limit > 0 && next < page.total && next <= MAX_OFFSET ? next : null;
}

export async function fetchArchiveIndex(
  url: string,
  signal: AbortSignal,
  onProgress: (loaded: number, total: number) => void,
): Promise<AssetArchive[] | ArchiveFile[]> {
  const entries: (AssetArchive | ArchiveFile)[] = [];
  const request = new URL(url);
  const snapshot = request.searchParams.get("snapshot");
  let offset = 0;
  for (;;) {
    signal.throwIfAborted();
    request.searchParams.set("offset", String(offset));
    request.searchParams.set("limit", "1000");
    const page = await fetchAssetBrowser<ArchivePage | ArchiveFilePage>(request.toString(), signal);
    signal.throwIfAborted();
    const rows = "bundles" in page ? page.bundles : page.assets;
    if (page.snapshot !== snapshot || page.offset !== offset || !Array.isArray(rows)) throw new AssetBrowserError(502);
    entries.push(...rows);
    onProgress(entries.length, page.total);
    if (entries.length >= page.total) return entries as AssetArchive[] | ArchiveFile[];
    const next = nextPageOffset(page);
    if (!rows.length || next === null || next <= offset) throw new AssetBrowserError(502);
    offset = next;
  }
}

export function formatAssetBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${Number((bytes / 1024 ** unit).toFixed(2))} ${units[unit]}`;
}
