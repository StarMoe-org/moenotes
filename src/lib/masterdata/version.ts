import { masterdataConfig } from "@/config/masterdata";
import { storageKeys } from "@/config/storage";
import type { VersionManifest } from "@/types/masterdata";
import { safeGetLocalStorage, safeSetLocalStorage } from "@/lib/storage/safe-storage";

export const fallbackVersionManifest: VersionManifest = {
  dataVersion: "mock-0",
  assetVersion: "mock-0",
  appVersion: "0.1.0",
  generatedAt: new Date(0).toISOString(),
};

export function getStoredDataVersion(): string | null {
  return safeGetLocalStorage(storageKeys.masterdataVersion);
}

export function setStoredDataVersion(version: string): void {
  safeSetLocalStorage(storageKeys.masterdataVersion, version);
}

export async function fetchVersionManifest(source: "official" | "mirror" = "mirror"): Promise<VersionManifest> {
  const base = masterdataConfig.sources[source];
  try {
    const response = await fetch(`${base}${masterdataConfig.versionPath}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Version request failed: ${response.status}`);
    const manifest = await response.json() as VersionManifest;
    if (!manifest.dataVersion) throw new Error("Missing dataVersion");
    setStoredDataVersion(manifest.dataVersion);
    return manifest;
  } catch {
    return fallbackVersionManifest;
  }
}
