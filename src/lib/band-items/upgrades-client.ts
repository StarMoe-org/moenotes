import type { BandItemUpgradesPayload } from "@/lib/band-items/data";
import { withClientMasterDataVersion } from "@/lib/masterdata/client-version";

let payloadPromise: Promise<BandItemUpgradesPayload | null> | null = null;
let loadedUrl: string | null = null;

/**
 * `/band-item-upgrades.json?v=<dataVersion>`, fetched on the first detail open and cached for the active version.
 * Resolves to null when the file cannot be loaded (the overlay then shows its empty state); a failure is not cached,
 * so reopening retries.
 */
export function loadBandItemUpgrades(options?: { forceBypass?: boolean }): Promise<BandItemUpgradesPayload | null> {
  const url = withClientMasterDataVersion("/band-item-upgrades.json", options);
  if (options?.forceBypass || !payloadPromise || loadedUrl !== url) {
    loadedUrl = url;
    payloadPromise = fetch(url, {
      cache: options?.forceBypass ? "no-store" : "default",
      headers: { accept: "application/json" },
    })
      .then((response) => (response.ok ? response.json() as Promise<BandItemUpgradesPayload> : null))
      .then((payload) => (payload && typeof payload === "object" && payload.servers && payload.groupSets ? payload : null))
      .catch(() => null)
      .then((payload) => {
        if (!payload) {
          payloadPromise = null;
          loadedUrl = null;
        }
        return payload;
      });
  }
  return payloadPromise;
}
