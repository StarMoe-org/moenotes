import type { AssetStore } from "ournotes-player";
import { createPlayerFileFetch } from "@/lib/cache/player-files";

/** Network side of the 3D chart previewer: a chart's files, through the browser's player file cache. */

const chartFileFetch = createPlayerFileFetch("chart");

/**
 * One chart's files (its manifest and every asset it lists), with byte progress. ChartPlayer's own loader takes no
 * fetch function, so the stage loads the store here and hands it to the player.
 */
export async function loadChartAssets(manifestUrl: string, signal: AbortSignal, onProgress: (loaded: number, total: number) => void): Promise<AssetStore> {
  const { AssetStore } = await import("ournotes-player");
  return AssetStore.fromManifest(manifestUrl, { signal, onProgress, fetch: chartFileFetch });
}
