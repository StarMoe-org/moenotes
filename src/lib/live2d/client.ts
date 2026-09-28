import type { AssetStore } from "ournotes-player/live2d";
import { assetConfig } from "@/config/assets";
import { createPlayerFileFetch } from "@/lib/cache/player-files";
import { getLive2DModelsIndexUrl, mergeLive2DModelIndexes, type Live2DModel, type Live2DModelEntry } from "@/lib/live2d/models";

/** Network side of the Live2D viewer: the published model indexes, a model's files and Live2D Cubism Core. */

/** A model's files come from the browser's player file cache once downloaded (they are content-addressed). */
const modelFileFetch = createPlayerFileFetch("live2d");

/**
 * The viewer's models: the model site's `models.json` and the story site's, merged by mergeLive2DModelIndexes. A site
 * that cannot be read only takes its models out; the model site's failure is thrown when neither can.
 */
export async function fetchLive2DModels(signal: AbortSignal): Promise<Live2DModel[]> {
  const [modelSite, storySite] = await Promise.allSettled([
    fetchModelIndex(assetConfig.chartSite, signal),
    fetchModelIndex(assetConfig.storySite, signal),
  ]);
  if (modelSite.status === "rejected" && storySite.status === "rejected") throw modelSite.reason;
  return mergeLive2DModelIndexes(
    modelSite.status === "fulfilled" ? modelSite.value : [],
    storySite.status === "fulfilled" ? storySite.value : [],
  );
}

/** One model's files (its manifest and every asset it lists), with byte progress. */
export async function loadLive2DModelAssets(manifestUrl: string, signal: AbortSignal, onProgress: (loaded: number, total: number) => void): Promise<AssetStore> {
  const { AssetStore } = await import("ournotes-player/live2d");
  return AssetStore.fromManifest(manifestUrl, { signal, onProgress, fetch: modelFileFetch });
}

/** `models.json` of a player site; no models when the site has none yet (404). */
async function fetchModelIndex(site: string, signal: AbortSignal): Promise<Live2DModelEntry[]> {
  const url = getLive2DModelsIndexUrl(site);
  const response = await fetch(url, { signal, credentials: "omit", headers: { Accept: "application/json" } });
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const index = (await response.json()) as { models?: unknown };
  return Array.isArray(index.models)
    ? index.models.filter((entry): entry is Live2DModelEntry => typeof entry === "object" && entry !== null && typeof (entry as Live2DModelEntry).id === "string")
    : [];
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
