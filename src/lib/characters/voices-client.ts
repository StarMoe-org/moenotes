import type { CharacterVoicesPayload } from "@/lib/characters/voices";
import { withClientMasterDataVersion } from "@/lib/masterdata/client-version";

let payloadPromise: Promise<CharacterVoicesPayload | null> | null = null;
let loadedUrl: string | null = null;

/**
 * `/character-voices.json?v=<dataVersion>`, fetched when a character page's voice section first opens and cached for
 * the active version. Resolves to null when the file cannot be loaded (the section then shows its error state); a
 * failure is not cached, so trying again refetches.
 */
export function loadCharacterVoices(options?: { forceBypass?: boolean }): Promise<CharacterVoicesPayload | null> {
  const url = withClientMasterDataVersion("/character-voices.json", options);
  if (options?.forceBypass || !payloadPromise || loadedUrl !== url) {
    loadedUrl = url;
    payloadPromise = fetch(url, {
      cache: options?.forceBypass ? "no-store" : "default",
      headers: { accept: "application/json" },
    })
      .then((response) => (response.ok ? response.json() as Promise<CharacterVoicesPayload> : null))
      .then((payload) => (payload && typeof payload === "object" && payload.servers && Array.isArray(payload.sets) && payload.texts ? payload : null))
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
