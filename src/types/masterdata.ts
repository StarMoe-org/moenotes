export type MasterdataSource = "official" | "mirror";

/** One region entry in metadata.bdon.moe/current_version.json (snake_case as served). */
export interface RegionVersion {
  version: string;
  resource_version?: string;
  verified_at?: string;
  table_count?: number;
  record_count?: number;
  manifest_sha256?: string;
  snapshot_path?: string;
  data_path?: string;
}

export interface VersionManifest {
  dataVersion: string;
  /** Legacy single hash from the old /version/latest.json manifest. */
  version?: string;
  schema_version?: number;
  /** Per-region hashes from metadata.bdon.moe/current_version.json, keyed by region (hk-tw-mo, en, kr, …). */
  regions?: Record<string, RegionVersion>;
  assetVersion?: string;
  appVersion?: string;
  generatedAt?: string;
  /** True when the manifest came from the last known local version instead of the network. */
  isFallback?: boolean;
  /** Network source that successfully served the manifest, when known. */
  source?: MasterdataSource;
  fetchedAt?: string;
  tableCount?: number;
  tables?: string[];
}
