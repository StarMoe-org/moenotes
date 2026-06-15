import { masterdataConfig } from "@/config/masterdata";
import { storageKeys } from "@/config/storage";
import { safeGetLocalStorage, safeSetLocalStorage } from "@/lib/storage/safe-storage";
import type { VersionManifest } from "@/types/masterdata";
import type { MasterdataSource } from "@/types/settings";

export const fallbackVersionManifest: VersionManifest = {
  dataVersion: "",
  assetVersion: "",
  appVersion: "0.1.0",
  generatedAt: new Date(0).toISOString(),
  isFallback: true,
};

export function getStoredDataVersion(): string | null {
  return safeGetLocalStorage(storageKeys.masterdataVersion);
}

export function setStoredDataVersion(version: string): void {
  safeSetLocalStorage(storageKeys.masterdataVersion, version);
}

export function getMasterdataSourceFallbackOrder(source: MasterdataSource): MasterdataSource[] {
  return source === "official" ? ["official", "mirror"] : ["mirror", "official"];
}

export async function fetchVersionManifest(source: MasterdataSource = "mirror"): Promise<VersionManifest> {
  const errors: string[] = [];

  for (const candidate of getMasterdataSourceFallbackOrder(source)) {
    const base = masterdataConfig.sources[candidate];
    try {
      const response = await fetch(`${base}${masterdataConfig.versionPath}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`Version request failed: ${response.status}`);
      const manifest = await response.json() as VersionManifest;
      if (!manifest.dataVersion) throw new Error("Missing dataVersion");
      setStoredDataVersion(manifest.dataVersion);
      return { ...manifest, source: candidate, isFallback: false };
    } catch (error) {
      errors.push(`${candidate}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const storedVersion = getStoredDataVersion();
  if (storedVersion) {
    return {
      ...fallbackVersionManifest,
      dataVersion: storedVersion,
      source,
      isFallback: true,
    };
  }

  throw new Error(`Version manifest unavailable (${errors.join("; ")})`);
}
