export interface VersionManifest {
  dataVersion: string;
  assetVersion?: string;
  appVersion?: string;
  generatedAt?: string;
}

export interface MasterDataFetchOptions {
  noCache?: boolean;
  source?: "official" | "mirror";
}
