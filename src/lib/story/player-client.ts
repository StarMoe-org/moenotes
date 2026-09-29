import { assetConfig } from "@/config/assets";
import { createPlayerFileFetch } from "@/lib/cache/player-files";
import { loadCubismCore } from "@/lib/live2d/client";
import { getStoriesIndexUrl, getStoryManifestUrl, getStorySiteRoots, mergeStorySiteEntries, type StorySiteEntry } from "@/lib/story/player-data";

/** Network side of the story player: the published story index, one story's presence and the page-side scripts. */

/**
 * The story player's fetch function: a story's files (its models' too) come from the browser's player file cache once
 * downloaded, so replaying an episode or switching its language downloads nothing again.
 */
export const storyPlayerFetch = createPlayerFileFetch("story");

/** `stories.json` of one site, its entries marked with the site; no stories when the site has none yet (404). */
async function fetchSiteIndex(root: string, signal: AbortSignal): Promise<StorySiteEntry[]> {
  const response = await fetch(getStoriesIndexUrl(root), { signal, credentials: "omit", headers: { Accept: "application/json" } });
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`${root}/stories.json: HTTP ${response.status}`);
  const index = (await response.json()) as { stories?: unknown };
  return Array.isArray(index.stories)
    ? index.stories
      .filter((entry): entry is Omit<StorySiteEntry, "root"> => typeof entry === "object" && entry !== null
        && typeof (entry as StorySiteEntry).advId === "number" && typeof (entry as StorySiteEntry).manifest === "string")
      .map((entry) => ({ ...entry, root }))
    : [];
}

/**
 * The stories of every story site (getStorySiteRoots), an episode on several from the first. A site that cannot be
 * read leaves only its stories out; the list fails only when no site can be read.
 */
export async function fetchStorySite(signal: AbortSignal): Promise<StorySiteEntry[]> {
  const results = await Promise.allSettled(getStorySiteRoots().map((root) => fetchSiteIndex(root, signal)));
  const sites = results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
  if (sites.length === 0) throw results.find((result): result is PromiseRejectedResult => result.status === "rejected")?.reason;
  for (const result of results) if (result.status === "rejected") console.warn("[story-player] a story site could not be read:", result.reason);
  return mergeStorySiteEntries(sites);
}

/**
 * One story's entry read from its manifest (whose `story` block is the index entry), for a story the indexes do not
 * list yet: a build publishes each manifest as it lands and rewrites stories.json at its end. The first site that has
 * it; null when none does.
 */
export async function fetchSiteStory(advId: number, signal: AbortSignal): Promise<StorySiteEntry | null> {
  const manifest = `stories/${advId}.json`;
  for (const root of getStorySiteRoots()) {
    const response = await fetch(getStoryManifestUrl(root, manifest), { signal, credentials: "omit", headers: { Accept: "application/json" } }).catch(() => null);
    if (!response?.ok) continue;
    const body = (await response.json()) as { audio?: boolean; story?: Partial<StorySiteEntry> };
    const story = body.story;
    if (!story || story.advId !== advId || !Array.isArray(story.languages)) continue;
    return {
      id: String(advId), advId, root, manifest, titles: story.titles ?? {}, languages: story.languages,
      language: story.language ?? story.languages[0] ?? "ja", playbackMode: story.playbackMode ?? 0, audio: body.audio ?? true,
    };
  }
  return null;
}

/** Whether a story site has the episode (a HEAD of its manifest, so a story page need not read the whole indexes). */
export async function hasSiteStory(advId: number, signal: AbortSignal): Promise<boolean> {
  const found = await Promise.all(getStorySiteRoots().map(async (root) => {
    try {
      const response = await fetch(getStoryManifestUrl(root, `stories/${advId}.json`), { method: "HEAD", signal, credentials: "omit" });
      return response.ok;
    } catch {
      return false;
    }
  }));
  return found.includes(true);
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
