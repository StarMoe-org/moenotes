import type { AssetStore } from "ournotes-player/live2d";
import { getLive2DModelManifestUrl, getLive2DModelsIndexUrl, type Live2DModelEntry } from "@/lib/live2d/models";

/** Network side of the Live2D viewer: the published model index, a model's files and Live2D Cubism Core. */

/** `models.json` of the published site; no models when the site has none yet (404). */
export async function fetchLive2DModels(signal: AbortSignal): Promise<Live2DModelEntry[]> {
  const response = await fetch(getLive2DModelsIndexUrl(), { signal, credentials: "omit", headers: { Accept: "application/json" } });
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`models.json: HTTP ${response.status}`);
  const index = (await response.json()) as { models?: unknown };
  return Array.isArray(index.models)
    ? index.models.filter((entry): entry is Live2DModelEntry => typeof entry === "object" && entry !== null && typeof (entry as Live2DModelEntry).id === "string")
    : [];
}

/** One model's files (its manifest and every asset it lists), with byte progress. */
export async function loadLive2DModelAssets(id: string, signal: AbortSignal, onProgress: (loaded: number, total: number) => void): Promise<AssetStore> {
  const { AssetStore } = await import("ournotes-player/live2d");
  return AssetStore.fromManifest(getLive2DModelManifestUrl(id), { signal, onProgress });
}

let core: Promise<void> | null = null;

/**
 * Live2D Cubism Core for Web (`live2dcubismcore.min.js`), which defines the global the player uses. It is Live2D's own
 * software under its own license, loaded once from `url` as a classic script; a failed load can be tried again.
 */
export function loadCubismCore(url: string): Promise<void> {
  core ??= new Promise<void>((resolve, reject) => {
    if ("Live2DCubismCore" in window) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = url;
    script.async = true;
    script.addEventListener("load", () => ("Live2DCubismCore" in window ? resolve() : reject(new Error(`${url} did not define Live2DCubismCore`))));
    script.addEventListener("error", () => {
      script.remove();
      reject(new Error(`Live2D Cubism Core could not be loaded from ${url}`));
    });
    document.head.append(script);
  }).catch((error: unknown) => {
    core = null;
    throw error;
  });
  return core;
}
