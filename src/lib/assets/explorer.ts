import type { AssetArchive, ArchiveFile } from "@/types/asset-browser";

export type FileKind = "image" | "audio" | "video" | "text" | "other";
export type EntryKind = "folder" | "archive" | FileKind;
export type EntrySort = "default" | "name" | "nameDescending" | "size" | "sizeAscending";
export type ExplorerEntry =
  | { kind: "folder"; id: string; name: string; path: string; count: number }
  | { kind: "archive"; id: string; name: string; path: string; archive: AssetArchive }
  | { kind: FileKind; id: string; name: string; path: string; file: ArchiveFile };

export interface ExplorerLocation {
  archiveId: string | null;
  directory: string;
  page: number;
}

export const EXPLORER_ROOT: ExplorerLocation = { archiveId: null, directory: "", page: 0 };

export function normalizeAssetPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

export function displayArchiveName(path: string): string {
  return path
    .replace(/everything(?=(?:initialdownload)?\.bundle$)/i, "")
    .replace(/everything(?=(?:font-|live-note-skin)[^/]*\.bundle$)/i, "");
}

export function parentDirectory(path: string): string {
  const parts = normalizeAssetPath(path).split("/");
  parts.pop();
  return parts.join("/");
}

export function fileKind(file: ArchiveFile): FileKind {
  const type = file.resource_type.toLowerCase();
  const extension = (file.internal || file.key).split(".").pop()?.toLowerCase() ?? "";
  if (/texture|sprite/.test(type) || ["png", "webp", "jpg", "jpeg", "gif", "svg"].includes(extension)) return "image";
  if (/audio/.test(type) || ["mp3", "aac", "wav", "ogg", "flac", "acb", "awb"].includes(extension)) return "audio";
  if (/video/.test(type) || ["mp4", "webm", "usm"].includes(extension)) return "video";
  if (/textasset/.test(type) || ["json", "txt", "xml", "csv", "yaml", "yml"].includes(extension)) return "text";
  return "other";
}

export function buildDirectoryEntries(
  source: readonly AssetArchive[] | readonly ArchiveFile[],
  directory: string,
  query: string,
  sort: EntrySort,
): ExplorerEntry[] {
  const prefix = directory ? `${normalizeAssetPath(directory)}/` : "";
  const needle = query.trim().toLowerCase();
  const folders = new Map<string, Extract<ExplorerEntry, { kind: "folder" }>>();
  const entries: ExplorerEntry[] = [];
  for (const item of source) {
    const path = normalizeAssetPath(item.key);
    if (!("bundle_name" in item) && (path.toLowerCase() === "everything" || item.resource_type.includes("IAssetBundleResource"))) continue;
    if (!path.startsWith(prefix)) continue;
    const relative = path.slice(prefix.length);
    const visiblePath = "bundle_name" in item ? displayArchiveName(path) : path;
    const visibleRelative = visiblePath.slice(prefix.length);
    if (!relative || (needle && !visibleRelative.toLowerCase().includes(needle))) continue;
    const slash = relative.indexOf("/");
    if (!needle && slash !== -1) {
      const name = relative.slice(0, slash);
      const folderPath = `${prefix}${name}`;
      const folder = folders.get(folderPath);
      if (folder) folder.count++;
      else folders.set(folderPath, { kind: "folder", id: `folder:${folderPath}`, name, path: folderPath, count: 1 });
    } else {
      const name = visiblePath.split("/").pop() || visiblePath;
      if ("bundle_name" in item) entries.push({ kind: "archive", id: item.id, name, path, archive: item });
      else entries.push({ kind: fileKind(item), id: item.key, name, path, file: item });
    }
  }
  return [...folders.values(), ...entries].sort((a, b) => {
    if (a.kind === "folder" && b.kind !== "folder") return -1;
    if (b.kind === "folder" && a.kind !== "folder") return 1;
    if (sort === "size" || sort === "sizeAscending") {
      const difference = (b.kind === "archive" ? b.archive.bytes : 0) - (a.kind === "archive" ? a.archive.bytes : 0);
      if (difference) return sort === "sizeAscending" ? -difference : difference;
    }
    const order = a.name.localeCompare(b.name, undefined, { numeric: true }) || a.path.localeCompare(b.path) || a.id.localeCompare(b.id);
    return sort === "nameDescending" ? -order : order;
  });
}
