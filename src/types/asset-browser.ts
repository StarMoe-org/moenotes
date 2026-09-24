export interface AssetRegion {
  id: string;
  default_locale: string;
  locales: string[];
}

export interface AssetCatalog {
  snapshot: string;
  region: string;
  locale: string;
  version: string;
  created: number;
  current: boolean;
  content_sha256: string;
  bundles: number;
  assets: number;
  declared_bytes: number;
  remote_bundles: number;
  verified_bundles: number;
}

export interface AssetArchive {
  id: string;
  key: string;
  bundle_name: string;
  internal: string;
  provider: string;
  resource_type: string;
  catalog_hash: string;
  crc: number;
  bytes: number;
  candidate_id: string | null;
  remote: boolean;
  download_sha256: string | null;
  plain_sha256: string | null;
}

export interface ArchiveFile {
  key: string;
  resource_type: string;
  internal: string;
  ambiguous: boolean;
}

export interface AssetBrowserPage {
  snapshot: string;
  offset: number;
  limit: number;
  total: number;
}

export interface ArchivePage extends AssetBrowserPage {
  bundles: AssetArchive[];
}

export interface ArchiveFilePage extends AssetBrowserPage {
  assets: ArchiveFile[];
}

export interface BundleContent {
  path: string;
  kind: "asset" | "payload";
  source: string;
  path_id: number | null;
  bundle_id: string;
  bundle_key: string;
}

export interface BundleBrowsePage {
  snapshot: string;
  directory: string;
  query: string;
  offset: number;
  limit: number;
  total: number;
  folders: { path: string; name: string }[];
  files: BundleContent[];
}

export interface BundleScanStatus {
  snapshot: string;
  total: number;
  scanned: number;
  entries: number;
  local_bundles: number;
}
