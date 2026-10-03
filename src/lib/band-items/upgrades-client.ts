import type { BandItemUpgradesPayload } from "@/lib/band-items/data";

let payloadPromise: Promise<BandItemUpgradesPayload | null> | null = null;

/**
 * `/band-item-upgrades.json`, fetched on the first detail open and cached for the page. Resolves to null when the
 * file cannot be loaded (the overlay then shows its empty state); a failure is not cached, so reopening retries.
 */
export function loadBandItemUpgrades(): Promise<BandItemUpgradesPayload | null> {
  payloadPromise ??= fetch("/band-item-upgrades.json", { headers: { accept: "application/json" } })
    .then((response) => (response.ok ? response.json() as Promise<BandItemUpgradesPayload> : null))
    .then((payload) => (payload && typeof payload === "object" && payload.servers && payload.groupSets ? payload : null))
    .catch(() => null)
    .then((payload) => {
      if (!payload) payloadPromise = null;
      return payload;
    });
  return payloadPromise;
}
