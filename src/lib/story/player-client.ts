import { assetConfig } from "@/config/assets";
import { createPlayerFileFetch } from "@/lib/cache/player-files";
import { loadCubismCore } from "@/lib/live2d/client";
import { getStorySiteProxyRoot, getStorySites, type StorySiteEntry, type StorySiteRegion } from "@/lib/story/player-data";

/** Network side of the story player: the published story index, one story's presence and the page-side scripts. */

/**
 * The story player's fetch function: a story's files (its models' too) come from the browser's player file cache once
 * downloaded, so replaying an episode or switching its language downloads nothing again.
 */
export const storyPlayerFetch = createPlayerFileFetch("story");

/** A site's server-filtered public index; unreleased cloud entries never cross into the browser. */
async function fetchSiteIndex(site: { server: StorySiteRegion }, signal: AbortSignal): Promise<StorySiteEntry[]> {
  const url = `/api/v1/story-site/index?server=${encodeURIComponent(site.server)}`;
  const response = await fetch(url, { signal, credentials: "same-origin", headers: { Accept: "application/json" } });
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const index = (await response.json()) as { stories?: unknown };
  return Array.isArray(index.stories)
    ? index.stories
      .filter((entry): entry is Omit<StorySiteEntry, "root" | "server"> => typeof entry === "object" && entry !== null
        && typeof (entry as StorySiteEntry).advId === "number" && typeof (entry as StorySiteEntry).manifest === "string"
        && Array.isArray((entry as StorySiteEntry).languages))
      .map((entry) => ({ ...entry, root: getStorySiteProxyRoot(site.server), server: site.server }))
    : [];
}

/**
 * The filtered stories of every regional site. A site that cannot be read leaves only its stories out; the list fails
 * only when no site can be read. Keep duplicate ids until the local release metadata selects the eligible region.
 */
export async function fetchStorySite(signal: AbortSignal): Promise<StorySiteEntry[]> {
  const results = await Promise.allSettled(getStorySites().map((site) => fetchSiteIndex(site, signal)));
  const sites = results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
  if (sites.length === 0) throw results.find((result): result is PromiseRejectedResult => result.status === "rejected")?.reason;
  for (const result of results) if (result.status === "rejected") console.warn("[story-player] a story site could not be read:", result.reason);
  return sites.flat();
}

/** Whether the server-side, release-filtered regional indexes make this episode available to the player. */
export async function hasSiteStory(advId: number, signal: AbortSignal): Promise<boolean> {
  if (!Number.isSafeInteger(advId) || advId <= 0) return false;
  const results = await Promise.allSettled(getStorySites().map((site) => fetchSiteIndex(site, signal)));
  return results.some((result) => result.status === "fulfilled" && result.value.some((entry) => entry.advId === advId));
}

/** What the page could load besides Cubism Core: missing optional scripts only take their part out of the story. */
export interface StoryRuntimes {
  motionSync: boolean;
  spine: boolean;
}

let optional: Promise<StoryRuntimes> | null = null;

/**
 * Live2D Cubism Core (required: without it a story does not load), then the optional MotionSync Core and Spine runtime
 * when the deployment names them (`assetConfig`). All are classic scripts defining globals, each its maker's software.
 */
export async function loadStoryRuntimes(): Promise<StoryRuntimes> {
  await loadCubismCore(assetConfig.cubismCore);
  optional ??= Promise.all([
    loadGlobalScript("Live2DCubismMotionSyncCore", assetConfig.motionSyncCore),
    loadGlobalScript("spine", assetConfig.spineRuntime),
  ]).then(([motionSync, spine]) => ({ motionSync, spine }));
  return optional;
}

/** Loads `url` once as a classic script; resolves to whether it defined `global` (false without a url or on failure). */
function loadGlobalScript(global: string, url: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    if (global in window) {
      resolve(true);
      return;
    }
    if (!url) {
      resolve(false);
      return;
    }
    const script = document.createElement("script");
    script.src = url;
    script.async = true;
    script.addEventListener("load", () => resolve(global in window));
    script.addEventListener("error", () => {
      script.remove();
      console.warn(`[story-player] ${global} could not be loaded from ${url}`);
      resolve(false);
    });
    document.head.append(script);
  });
}
