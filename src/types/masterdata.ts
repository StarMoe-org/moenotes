export type MasterdataSource = "official" | "mirror";

export interface VersionManifest {
  dataVersion: string;
  /** Hash returned by metadata.bdon.moe/version/latest.json. */
  version?: string;
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
