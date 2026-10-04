import type { CharacterVoicesPayload } from "@/lib/characters/voices";

let payloadPromise: Promise<CharacterVoicesPayload | null> | null = null;

/**
 * `/character-voices.json`, fetched when a character page's voice section first opens and cached for the page.
 * Resolves to null when the file cannot be loaded (the section then shows its error state); a failure is not cached,
 * so trying again refetches.
 */
export function loadCharacterVoices(): Promise<CharacterVoicesPayload | null> {
  payloadPromise ??= fetch("/character-voices.json", { headers: { accept: "application/json" } })
    .then((response) => (response.ok ? response.json() as Promise<CharacterVoicesPayload> : null))
    .then((payload) => (payload && typeof payload === "object" && payload.servers && Array.isArray(payload.sets) && payload.texts ? payload : null))
    .catch(() => null)
    .then((payload) => {
      if (!payload) payloadPromise = null;
      return payload;
    });
  return payloadPromise;
}
