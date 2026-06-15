import type { MasterdataSource } from "@/types/settings";

export interface VersionManifest {
  dataVersion: string;
  assetVersion?: string;
  appVersion?: string;
  generatedAt?: string;
  /** True when the manifest came from the last known local version instead of the network. */
  isFallback?: boolean;
  /** Network source that successfully served the manifest, when known. */
  source?: MasterdataSource;
}

export interface MasterDataFetchOptions<T = unknown> {
  noCache?: boolean;
  source?: MasterdataSource;
  validate?: (raw: unknown) => T;
}
