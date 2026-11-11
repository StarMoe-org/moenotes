import type { AssetStore } from "ournotes-player/live2d";
import { GAME_SERVERS, type GameServer } from "@/config/servers";
import { getLive2DIndexApiPath, getLive2DProxyApiRoot } from "@/config/routes";
import { createPlayerFileFetch } from "@/lib/cache/player-files";
import type { Live2DModel } from "@/lib/live2d/models";

/** Network side of the Live2D viewer: a release-gated regional index, model files and Live2D Cubism Core. */

/** A model's files come from the browser's player file cache once downloaded (they are content-addressed). */
const modelFileFetch = createPlayerFileFetch("live2d");

/** Models are listed only by the same-origin endpoint after it checks the selected region's costume MasterData. */
export async function fetchLive2DModels(signal: AbortSignal, server: GameServer): Promise<Live2DModel[]> {
  const response = await fetch(`${getLive2DIndexApiPath()}?server=${encodeURIComponent(server)}`, {
    signal,
    credentials: "same-origin",
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Live2D model index: HTTP ${response.status}`);
  const payload = (await response.json()) as { models?: unknown };
  if (!Array.isArray(payload.models)) return [];
  const manifestPrefixes = (["chart", "story"] as const)
    .map((source) => `${getLive2DProxyApiRoot(server, source)}/models/`);
  return payload.models.filter((model): model is Live2DModel =>
    typeof model === "object" && model !== null
    && typeof (model as Live2DModel).id === "string"
    && /^[a-z0-9_]+$/.test((model as Live2DModel).id)
    && typeof (model as Live2DModel).manifestUrl === "string"
    && manifestPrefixes.some((prefix) => (model as Live2DModel).manifestUrl.startsWith(prefix))
    && typeof (model as Live2DModel).kind === "string"
    && ["story", "live", "side"].includes((model as Live2DModel).kind),
  );
}

/**
 * The release-gated root for one model's files. ournotes-player 0.1.8's AssetStore defaults to `../` from
 * `models/<id>.json` and ignores a manifest `root`, which would request the unscoped `/assets/<hash>` route. Give it
 * the model directory explicitly so its requests stay at `models/<id>/assets/<hash>` and the proxy can recheck that
 * exact model's release and manifest allowlist.
 */
export function getLive2DModelAssetBase(manifestUrl: string, pageUrl = currentPageUrl()): string {
  const page = new URL(pageUrl);
  const manifest = new URL(manifestUrl, page);
  if (manifest.origin !== page.origin || manifest.search || manifest.hash) {
    throw new Error("Live2D model manifest must be a same-origin proxy URL without a query or fragment");
  }
  const modelId = live2DModelIdFromProxyManifest(manifest.pathname);
  if (!modelId) throw new Error("Live2D model manifest is not a release-gated model route");
  return new URL(`./${modelId}/`, manifest).href;
}

function live2DModelIdFromProxyManifest(pathname: string): string | null {
  for (const server of GAME_SERVERS) {
    for (const source of ["chart", "story"] as const) {
      const prefix = `${getLive2DProxyApiRoot(server, source)}/models/`;
      if (!pathname.startsWith(prefix)) continue;
      const match = /^([a-z0-9_]+)\.json$/.exec(pathname.slice(prefix.length));
      if (match) return match[1]!;
    }
  }
  return null;
}

function currentPageUrl(): string {
  if (typeof window === "undefined") throw new Error("Live2D asset URLs can only be resolved in a browser page");
  return window.location.href;
}

/** One model's files (its manifest and every asset it lists), with byte progress. */
export async function loadLive2DModelAssets(manifestUrl: string, signal: AbortSignal, onProgress: (loaded: number, total: number) => void): Promise<AssetStore> {
  const { AssetStore } = await import("ournotes-player/live2d");
  const base = getLive2DModelAssetBase(manifestUrl);
  return AssetStore.fromManifest(manifestUrl, { signal, onProgress, fetch: modelFileFetch, base });
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
